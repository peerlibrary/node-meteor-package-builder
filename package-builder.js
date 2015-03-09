// To make debugging easier.
Error.stackTraceLimit = Infinity;

var loadModule = function (Npm, PackageVersion) {
  var Fiber = Npm.require('fibers');
  var Future = Npm.require('fibers/future');

  var overriddenRequire = function (originalRequire, path) {
    if (path === 'fibers') {
      return Fiber;
    }
    else if (path === 'fibers/future') {
      return Future;
    }
    else if (path === './package-version-parser.js') {
      return PackageVersion;
    }
    else {
      return originalRequire.call(this, path);
    }
  };

  var overrideExtensionHandlers = function () {
    Object.keys(require.extensions).forEach(function (extension) {
      var originalExtension = require.extensions[extension];

      require.extensions[extension] = function (module, filename) {
        module.require = overriddenRequire.bind(module, module.require);

        return originalExtension(module, filename);
      };
    });
  };

  overrideExtensionHandlers();

  /*
     The following code is taken from commands-packages.js file with everything
     except the package building/publishing code removed.
   */

  var _ = Npm.require('underscore');
  var files = require('./meteor/tools/files.js');
  var buildmessage = require('./meteor/tools/buildmessage.js');
  var release = require('./meteor/tools/release.js');
  var utils = require('./meteor/tools/utils.js');
  var catalog = require('./meteor/tools/catalog.js');
  var projectContextModule = require('./meteor/tools/project-context.js');
  var compiler = require('./meteor/tools/compiler.js');

  require('./meteor/tools/isopackets.js').ensureIsopacketsLoadable();

  // Initialize the server catalog.
  catalog.official.initialize({
    offline: !!process.env.METEOR_OFFLINE_CATALOG
  });

  var captureAndExit = function (header, title, f) {
    var messages;
    if (f) {
      messages = buildmessage.capture({ title: title }, f);
    } else {
      messages = buildmessage.capture(title);  // title is really f
    }
    if (messages.hasMessages()) {
      throw new Error(header + "\n" + messages.formatMessages());
    }
  };

  var buildPackage = function (options) {
    if (_.has(options, 'offline')) {
      catalog.official.offline = options.offline;
    }
    else {
      catalog.official.offline = !!process.env.METEOR_OFFLINE_CATALOG;
    }

    if (options.release) {
      options.releaseForConstraints = release.load(options.release);
    }

    var projectContext;
    // We're not in an app? OK, make a temporary app directory, and make sure
    // that the current package directory is found by its local catalog.
    var tempProjectDir = files.mkdtemp('meteor-package-build');
    projectContext = new projectContextModule.ProjectContext(_.extend({
      projectDir: tempProjectDir,  // won't have a packages dir, that's OK
      explicitlyAddedLocalPackageDirs: [options.packageDir],
      packageMapFilename: files.pathJoin(options.packageDir, '.versions'),
      // We always want to write our '.versions' package map, overriding a
      // comparison against the value of a release file that doesn't exist.
      alwaysWritePackageMap: true,
      // When we publish, we should always include web.cordova unibuilds, even
      // though this temporary directory does not have any cordova platforms
      forceIncludeCordovaUnibuild: true
    }, options));

    captureAndExit("=> Errors while initializing project:", function () {
      // Just get up to initializing the catalog. We're going to mutate the
      // constraints file a bit before we prepare the build.
      projectContext.initializeCatalog();
    });

    var localVersionRecord = projectContext.localCatalog.getVersionBySourceRoot(
      options.packageDir);
    if (! localVersionRecord) {
      // OK, we're inside a package (ie, a directory with a package.js) and we're
      // inside an app (ie, a directory with a file named .meteor/packages) but
      // the package is not on the app's search path (ie, it's probably not
      // directly inside the app's packages directory).  That's kind of
      // weird. Let's not allow this.
      throw new Error(
        "The package you are in appears to be inside a Meteor app but is not " +
         "in its packages directory. You may only publish packages that are " +
         "entirely outside of a project or that are loaded by the project " +
         "that they are inside.");
    }
    var packageName = localVersionRecord.packageName;
    var packageSource = projectContext.localCatalog.getPackageSource(packageName);
    if (! packageSource)
      throw new Error("no PackageSource for " + packageName);

    // Anything published to the server must explicitly set a version.
    if (! packageSource.versionExplicitlyProvided) {
      throw new Error("A version must be specified for the package. Set it with " +
                    "Package.describe.");
    }

    // Make sure that both the package and its test (if any) are actually built.
    _.each([packageName, packageSource.testName], function (name) {
      if (! name)  // for testName
        return;
      // If we're already using this package, that's OK; no need to override.
      if (projectContext.projectConstraintsFile.getConstraint(name))
        return;
      projectContext.projectConstraintsFile.addConstraints(
        [utils.parseConstraint(name)]);
    });

    // Now resolve constraints and build packages.
    captureAndExit("=> Errors while building the package:", function () {
      projectContext.prepareProjectForBuild();
    });
    // We don't display the package map delta here, because it includes adding the
    // package's test and all the test's dependencies.

    var result = {
      projectContext: projectContext,
      packageSource: packageSource
    };

    /*
       The following code is taken from package-client.js file's publishPackage
       function.
     */

    captureAndExit("=> Errors while finalizing the package:", "finalizing the package", function () {
      buildmessage.assertInJob();

      var name = packageSource.name;
      var version = packageSource.version;

      // Check that the package name is valid.
      utils.validatePackageName(name, { useBuildmessage: true });
      if (buildmessage.jobHasMessages())
        return;

      // Check that we have a version.
      if (!version) {
        buildmessage.error(
          "Package cannot be finalized because it doesn't have a version");
        return;
      }

      // Check that the package does not have any unconstrained references.
      var packageDeps = packageSource.getDependencyMetadata();
      _.each(packageDeps, function (refs, label) {
        if (refs.constraint == null) {
          if (packageSource.isCore && files.inCheckout() &&
            projectContext.localCatalog.getPackage(label)) {
            // Core package is using or implying another core package,
            // without a version number.  We fill in the version number.
            // (Well, we're assuming that the other package is core and
            // not some other sort of local package.)
            var versionString =
              projectContext.localCatalog.getLatestVersion(label).version;
            // modify the constraint on this dep that will be sent to troposphere
            refs.constraint = versionString;
          } else if (label === "meteor") {
            // HACK: We are willing to publish a package with a "null"
            // constraint on the "meteor" package to troposphere.  This
            // happens for non-core packages when not running from a
            // checkout, because all packages implicitly depend on the
            // "meteor" package, but do not necessarily specify an
            // explicit version for it, and we don't have a great way to
            // choose one here.
            // XXX come back to this, especially if we are incrementing the
            // major version of "meteor".  hopefully we will have more data
            // about the package system by then.
          } else {
            buildmessage.error(
                "You must specify a version constraint for package " + label);
          }
        }
      });
      if (buildmessage.jobHasMessages())
        return;

      var isopack = projectContext.isopackCache.getIsopack(name);
      if (!isopack)
        throw Error("no isopack " + name);

      if (isopack.platformSpecific()) {
        // TODO: This is unsupported for now.
        buildmessage.error(
            "Build is platform specific (contains binary builds).");
        return;
      }

      var sourceFiles = isopack.getSourceFilesUnderSourceRoot(
        packageSource.sourceRoot);
      if (!sourceFiles)
        throw Error("isopack doesn't know what its source files are?");

      // We need to have built the test package to get all of its sources, even
      // though we're not publishing a BUILD for the test package.
      if (packageSource.testName) {
        var testIsopack = projectContext.isopackCache.getIsopack(
          packageSource.testName);
        if (!testIsopack)
          throw Error("no testIsopack " + packageSource.testName);
        var testSourceFiles = testIsopack.getSourceFilesUnderSourceRoot(
          packageSource.sourceRoot);
        if (!testSourceFiles)
          throw Error("test isopack doesn't know what its source files are?");
        sourceFiles = _.union(sourceFiles, testSourceFiles);
      }

      var tempDir = files.mkdtemp('build-package-');
      var packageTarName = isopack.tarballName();
      var bundleRoot = files.pathJoin(tempDir, packageTarName);

      // Note that we do need to do this even though we already have the isopack on
      // disk in an IsopackCache, because we don't want to include
      // isopack-buildinfo.json. (We don't include it because we're not passing
      // includeIsopackBuildInfo to saveToPath here.)
      isopack.saveToPath(bundleRoot);

      _.extend(result, {
        isopack: isopack,
        sourceFiles: sourceFiles,
        sourceRoot: packageSource.sourceRoot,
        compilerVersion: compiler.BUILT_BY,
        containsPlugins: packageSource.containsPlugins(),
        debugOnly: packageSource.debugOnly,
        exports: packageSource.getExports(),
        releaseName: options.releaseForConstraints && options.releaseForConstraints.name,
        dependencies: packageDeps,
        packageName: isopack.name,
        version: isopack.version,
        buildArchitectures: isopack.buildArchitectures(),
        bundleRoot: bundleRoot
      });
    });

    return result;
  };

  return buildPackage;
};

module.exports = loadModule;

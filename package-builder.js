// When used as a Meteor package, package-version-parser detects
// Package and believes SemVer410 and _ are available globally.
global.SemVer410 = require('semver');
global._ = require('underscore');

/*
   This code is taken from commands-packages.js file with everything
   except the package building/publishing code removed.
 */

var main = require('./meteor/tools/main.js');
var _ = require('underscore');
var files = require('./meteor/tools/files.js');
var deploy = require('./meteor/tools/deploy.js');
var buildmessage = require('./meteor/tools/buildmessage.js');
var warehouse = require('./meteor/tools/warehouse.js');
var auth = require('./meteor/tools/auth.js');
var config = require('./meteor/tools/config.js');
var release = require('./meteor/tools/release.js');
var Future = require('fibers/future');
var runLog = require('./meteor/tools/run-log.js');
var utils = require('./meteor/tools/utils.js');
var httpHelpers = require('./meteor/tools/http-helpers.js');
var archinfo = require('./meteor/tools/archinfo.js');
var tropohouse = require('./meteor/tools/tropohouse.js');
var compiler = require('./meteor/tools/compiler.js');
var catalog = require('./meteor/tools/catalog.js');
var stats = require('./meteor/tools/stats.js');
var isopack = require('./meteor/tools/isopack.js');
var cordova = require('./meteor/tools/commands-cordova.js');
var Console = require('./meteor/tools/console.js').Console;
var projectContextModule = require('./meteor/tools/project-context.js');

function buildPackage(options, publishPackage) {
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

  main.captureAndExit("=> Errors while initializing project:", function () {
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
    Console.error(
      "The package you are in appears to be inside a Meteor app but is not " +
       "in its packages directory. You may only publish packages that are " +
       "entirely outside of a project or that are loaded by the project " +
       "that they are inside.");
    return 1;
  }
  var packageName = localVersionRecord.packageName;
  var packageSource = projectContext.localCatalog.getPackageSource(packageName);
  if (! packageSource)
    throw Error("no PackageSource for " + packageName);

  // Anything published to the server must explicitly set a version.
  if (! packageSource.versionExplicitlyProvided) {
    Console.error("A version must be specified for the package. Set it with " +
                  "Package.describe.");
    return 1;
  }

  // Make sure that both the package and its test (if any) are actually built.
  _.each([packageName, packageSource.testName], function (name) {
    if (! name)  // for testName
      return;
    // If we're already using this package, that's OK; no need to override.
    if (projectContext.projectConstraintsFile.getConstraint(name))
      return;
    projectContext.projectConstraintsFile.addConstraints(
      [utils.parsePackageConstraint(name)]);
  });

  // Now resolve constraints and build packages.
  main.captureAndExit("=> Errors while initializing project:", function () {
    projectContext.prepareProjectForBuild();
  });
  // We don't display the package map delta here, because it includes adding the
  // package's test and all the test's dependencies.

  var isopack = projectContext.isopackCache.getIsopack(packageName);
  if (! isopack) {
    // This shouldn't happen; we already threw a different error if the package
    // wasn't even in the local catalog, and we explicitly added this package to
    // the project's constraints file, so it should have been built.
    throw Error("package not built even though added to constraints?");
  }

  // We have initialized everything, so perform the publish operation.
  var binary = isopack.platformSpecific();
  main.captureAndExit(
    "=> Errors while publishing:",
    "publishing the package",
    function () {
      publishPackage({
        projectContext: projectContext,
        packageSource: packageSource,
        binary: binary
      });
    });

  Console.info('Published ' + packageName + '@' + localVersionRecord.version +
               '.');

  return 0;
}

module.exports = buildPackage;

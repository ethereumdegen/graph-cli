"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const core_1 = require("@oclif/core");
const fetch_1 = require("@whatwg-node/fetch");
const binary_install_raw_1 = require("binary-install-raw");
const gluegun_1 = require("gluegun");
const js_yaml_1 = __importDefault(require("js-yaml"));
const semver_1 = __importDefault(require("semver"));
class TestCommand extends core_1.Command {
    async run() {
        const { args: { datasource }, flags: { coverage, docker, force, logs, recompile, version }, } = await this.parse(TestCommand);
        let testsDir = './tests';
        // Check if matchstick.yaml config exists
        if (gluegun_1.filesystem.exists('matchstick.yaml')) {
            try {
                // Load the config
                const config = await js_yaml_1.default.load(gluegun_1.filesystem.read('matchstick.yaml', 'utf8'));
                // Check if matchstick.yaml and testsFolder not null
                if (config?.testsFolder) {
                    // assign test folder from matchstick.yaml if present
                    testsDir = config.testsFolder;
                }
            }
            catch (error) {
                this.error(`A problem occurred while reading "matchstick.yaml":\n${error.message}`, {
                    exit: 1,
                });
            }
        }
        const cachePath = path_1.default.resolve(testsDir, '.latest.json');
        const opts = {
            testsDir,
            cachePath,
            coverage,
            docker,
            force,
            logs,
            recompile,
            version,
            latestVersion: getLatestVersionFromCache(cachePath),
        };
        // Fetch the latest version tag if version is not specified with -v/--version or if the version is not cached
        if (opts.force || (!opts.version && !opts.latestVersion)) {
            this.log('Fetching latest version tag...');
            const result = await (0, fetch_1.fetch)('https://api.github.com/repos/LimeChain/matchstick/releases/latest');
            const json = await result.json();
            opts.latestVersion = json.tag_name;
            gluegun_1.filesystem.file(opts.cachePath, {
                content: {
                    version: json.tag_name,
                    timestamp: Date.now(),
                },
            });
        }
        if (opts.docker) {
            runDocker.bind(this)(datasource, opts);
        }
        else {
            runBinary.bind(this)(datasource, opts);
        }
    }
}
TestCommand.description = 'Runs rust binary for subgraph testing.';
TestCommand.args = {
    datasource: core_1.Args.string(),
};
TestCommand.flags = {
    help: core_1.Flags.help({
        char: 'h',
    }),
    coverage: core_1.Flags.boolean({
        summary: 'Run the tests in coverage mode.',
        char: 'c',
    }),
    docker: core_1.Flags.boolean({
        summary: 'Run the tests in a docker container (Note: Please execute from the root folder of the subgraph).',
        char: 'd',
    }),
    force: core_1.Flags.boolean({
        summary: 'Binary - overwrites folder + file when downloading. Docker - rebuilds the docker image.',
        char: 'f',
    }),
    logs: core_1.Flags.boolean({
        summary: 'Logs to the console information about the OS, CPU model and download url (debugging purposes).',
        char: 'l',
    }),
    recompile: core_1.Flags.boolean({
        summary: 'Force-recompile tests.',
        char: 'r',
    }),
    version: core_1.Flags.string({
        summary: 'Choose the version of the rust binary that you want to be downloaded/used.',
        char: 'v',
    }),
};
exports.default = TestCommand;
function getLatestVersionFromCache(cachePath) {
    if (gluegun_1.filesystem.exists(cachePath) == 'file') {
        const cached = gluegun_1.filesystem.read(cachePath, 'json');
        // Get the cache age in days
        const cacheAge = (Date.now() - cached.timestamp) / (1000 * 60 * 60 * 24);
        // If cache age is less than 1 day, use the cached version
        if (cacheAge < 1) {
            return cached.version;
        }
    }
    return null;
}
async function runBinary(datasource, opts) {
    const coverageOpt = opts.coverage;
    const forceOpt = opts.force;
    const logsOpt = opts.logs;
    const versionOpt = opts.version;
    const latestVersion = opts.latestVersion;
    const recompileOpt = opts.recompile;
    const platform = await getPlatform.bind(this)(logsOpt);
    const url = `https://github.com/LimeChain/matchstick/releases/download/${versionOpt || latestVersion}/${platform}`;
    if (logsOpt) {
        this.log(`Download link: ${url}`);
    }
    const binary = new binary_install_raw_1.Binary(platform, url, versionOpt || latestVersion);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    forceOpt ? await binary.install(true) : await binary.install(false);
    const args = [];
    if (coverageOpt)
        args.push('-c');
    if (recompileOpt)
        args.push('-r');
    if (datasource)
        args.push(datasource);
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    args.length > 0 ? binary.run(...args) : binary.run();
}
async function getPlatform(logsOpt) {
    const type = os_1.default.type();
    const arch = os_1.default.arch();
    const cpuCore = os_1.default.cpus()[0];
    const isAppleSilicon = arch === 'arm64' && /Apple (M1|M2|processor)/.test(cpuCore.model);
    const linuxInfo = type === 'Linux' ? await getLinuxInfo.bind(this)() : {};
    const linuxDistro = linuxInfo.name;
    const release = linuxInfo.version || os_1.default.release();
    const majorVersion = parseInt(linuxInfo.version || '', 10) || semver_1.default.major(release);
    if (logsOpt) {
        this.log(`OS type: ${linuxDistro || type}\nOS arch: ${arch}\nOS release: ${release}\nOS major version: ${majorVersion}\nCPU model: ${cpuCore.model}`);
    }
    if (arch === 'x64' || isAppleSilicon) {
        if (type === 'Darwin') {
            if (majorVersion === 18 || majorVersion === 19) {
                return 'binary-macos-10.15'; // GitHub dropped support for macOS 10.14 in Actions, but it seems 10.15 binary works on 10.14 too
            }
            if (isAppleSilicon) {
                return 'binary-macos-11-m1';
            }
            return 'binary-macos-11';
        }
        if (type === 'Linux') {
            if (majorVersion === 18) {
                return 'binary-linux-18';
            }
            if (majorVersion === 22) {
                return 'binary-linux-22';
            }
            return 'binary-linux-20';
        }
    }
    throw new Error(`Unsupported platform: ${type} ${arch} ${majorVersion}`);
}
async function getLinuxInfo() {
    try {
        const result = await gluegun_1.system.run("cat /etc/*-release | grep -E '(^VERSION|^NAME)='", {
            trim: true,
        });
        const infoArray = result
            .replace(/['"]+/g, '')
            .split('\n')
            .map(p => p.split('='));
        const linuxInfo = {};
        for (const val of infoArray) {
            linuxInfo[val[0].toLowerCase()] = val[1];
        }
        return linuxInfo;
    }
    catch (error) {
        this.error(`Error fetching the Linux version:\n${error}`, { exit: 1 });
    }
}
async function runDocker(datasource, opts) {
    const coverageOpt = opts.coverage;
    const forceOpt = opts.force;
    const versionOpt = opts.version;
    const latestVersion = opts.latestVersion;
    const recompileOpt = opts.recompile;
    // Remove binary-install-raw binaries, because docker has permission issues
    // when building the docker images
    gluegun_1.filesystem.remove('./node_modules/binary-install-raw/bin');
    // Get current working directory
    const current_folder = gluegun_1.filesystem.cwd();
    // Declate dockerfilePath with default location
    const dockerfilePath = path_1.default.join(opts.testsDir, '.docker/Dockerfile');
    // Check if the Dockerfil already exists
    const dockerfileExists = gluegun_1.filesystem.exists(dockerfilePath);
    // Generate the Dockerfile only if it doesn't exists,
    // version flag and/or force flag is passed.
    if (!dockerfileExists || versionOpt || forceOpt) {
        await dockerfile.bind(this)(dockerfilePath, versionOpt, latestVersion);
    }
    // Run a command to check if matchstick image already exists
    (0, child_process_1.exec)('docker images -q matchstick', (_error, stdout, _stderr) => {
        // Collect all(if any) flags and options that have to be passed to the matchstick binary
        let testArgs = '';
        if (coverageOpt)
            testArgs = testArgs + ' -c';
        if (recompileOpt)
            testArgs = testArgs + ' -r';
        if (datasource)
            testArgs = testArgs + ' ' + datasource;
        // Build the `docker run` command options and flags
        const dockerRunOpts = [
            'run',
            '-it',
            '--rm',
            '--mount',
            `type=bind,source=${current_folder},target=/matchstick`,
        ];
        if (testArgs !== '') {
            dockerRunOpts.push('-e');
            dockerRunOpts.push(`ARGS=${testArgs.trim()}`);
        }
        dockerRunOpts.push('matchstick');
        // If a matchstick image does not exists, the command returns an empty string,
        // else it'll return the image ID. Skip `docker build` if an image already exists
        // Delete current image(if any) and rebuild.
        // Use spawn() and {stdio: 'inherit'} so we can see the logs in real time.
        if (!dockerfileExists || stdout === '' || versionOpt || forceOpt) {
            if (stdout !== '') {
                (0, child_process_1.exec)('docker image rm matchstick', (_error, stdout, _stderr) => {
                    this.log(`Remove matchstick image result:\n${stdout}`);
                });
            }
            // Build a docker image. If the process has executed successfully
            // run a container from that image.
            (0, child_process_1.spawn)('docker', ['build', '-f', dockerfilePath, '-t', 'matchstick', '.'], {
                stdio: 'inherit',
            }).on('close', code => {
                if (code === 0) {
                    (0, child_process_1.spawn)('docker', dockerRunOpts, { stdio: 'inherit' });
                }
            });
        }
        else {
            this.log('Docker image already exists. Skipping `docker build` command...');
            // Run the container from the existing matchstick docker image
            (0, child_process_1.spawn)('docker', dockerRunOpts, { stdio: 'inherit' });
        }
    });
}
// Downloads Dockerfile template from the demo-subgraph repo
// Replaces the placeholders with their respective values
async function dockerfile(dockerfilePath, versionOpt, latestVersion) {
    const spinner = gluegun_1.print.spin('Generating Dockerfile...');
    try {
        // Fetch the Dockerfile template content from the demo-subgraph repo
        const content = await (0, fetch_1.fetch)('https://raw.githubusercontent.com/LimeChain/demo-subgraph/main/Dockerfile').then(response => {
            if (response.ok) {
                return response.text();
            }
            throw new Error(`Status Code: ${response.status}, with error: ${response.statusText}`);
        });
        // Write the Dockerfile
        gluegun_1.filesystem.write(dockerfilePath, content);
        // Replaces the version placeholders
        await gluegun_1.patching.replace(dockerfilePath, '<MATCHSTICK_VERSION>', versionOpt || latestVersion || 'unknown');
    }
    catch (error) {
        this.error(`A problem occurred while generating the Dockerfile:\n${error.message}`, {
            exit: 1,
        });
    }
    spinner.succeed('Successfully generated Dockerfile.');
}

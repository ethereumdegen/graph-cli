"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const core_1 = require("@oclif/core");
const gluegun_1 = require("gluegun");
const abi_1 = require("../command-helpers/abi");
const DataSourcesExtractor = __importStar(require("../command-helpers/data-sources"));
const network_1 = require("../command-helpers/network");
const node_1 = require("../command-helpers/node");
const scaffold_1 = require("../command-helpers/scaffold");
const spinner_1 = require("../command-helpers/spinner");
const studio_1 = require("../command-helpers/studio");
const subgraph_1 = require("../command-helpers/subgraph");
const debug_1 = __importDefault(require("../debug"));
const protocols_1 = __importDefault(require("../protocols"));
const schema_1 = require("../scaffold/schema");
const validation_1 = require("../validation");
const add_1 = __importDefault(require("./add"));
const initDebug = (0, debug_1.default)('graph-cli:init');
const protocolChoices = Array.from(protocols_1.default.availableProtocols().keys());
const availableNetworks = protocols_1.default.availableNetworks();
const DEFAULT_EXAMPLE_SUBGRAPH = 'ethereum/gravatar';
class InitCommand extends core_1.Command {
    async run() {
        const { args: { subgraphName, directory }, flags: { protocol, product, studio, node: nodeFlag, 'allow-simple-name': allowSimpleNameFlag, 'from-contract': fromContract, 'contract-name': contractName, 'from-example': fromExample, 'index-events': indexEvents, network, abi: abiPath, 'start-block': startBlock, }, } = await this.parse(InitCommand);
        let { node, allowSimpleName } = (0, node_1.chooseNodeUrl)({
            product,
            studio,
            node: nodeFlag,
            allowSimpleName: allowSimpleNameFlag,
        });
        if (fromContract && fromExample) {
            this.error('Only one of "--from-example" and "--from-contract" can be used at a time.', {
                exit: 1,
            });
        }
        // Detect git
        const git = gluegun_1.system.which('git');
        if (!git) {
            this.error('Git was not found on your system. Please install "git" so it is in $PATH.', {
                exit: 1,
            });
        }
        // Detect Yarn and/or NPM
        const yarn = gluegun_1.system.which('yarn');
        const npm = gluegun_1.system.which('npm');
        if (!yarn && !npm) {
            this.error(`Neither Yarn nor NPM were found on your system. Please install one of them.`, {
                exit: 1,
            });
        }
        const commands = {
            link: yarn ? 'yarn link @graphprotocol/graph-cli' : 'npm link @graphprotocol/graph-cli',
            install: yarn ? 'yarn' : 'npm install',
            codegen: yarn ? 'yarn codegen' : 'npm run codegen',
            deploy: yarn ? 'yarn deploy' : 'npm run deploy',
        };
        // If all parameters are provided from the command-line,
        // go straight to creating the subgraph from the example
        if (fromExample && subgraphName && directory) {
            return await initSubgraphFromExample.bind(this)({ fromExample, allowSimpleName, directory, subgraphName, studio, product }, { commands });
        }
        // Will be assigned below if ethereum
        let abi;
        // If all parameters are provided from the command-line,
        // go straight to creating the subgraph from an existing contract
        if (fromContract && protocol && subgraphName && directory && network && node) {
            if (!protocolChoices.includes(protocol)) {
                this.error(`Protocol '${protocol}' is not supported, choose from these options: ${protocolChoices.join(', ')}`, { exit: 1 });
            }
            const protocolInstance = new protocols_1.default(protocol);
            if (protocolInstance.hasABIs()) {
                const ABI = protocolInstance.getABI();
                if (abiPath) {
                    try {
                        abi = loadAbiFromFile(ABI, abiPath);
                    }
                    catch (e) {
                        this.error(`Failed to load ABI: ${e.message}`, { exit: 1 });
                    }
                }
                else {
                    try {
                        if (network === 'poa-core') {
                            abi = await (0, abi_1.loadAbiFromBlockScout)(ABI, network, fromContract);
                        }
                        else {
                            abi = await (0, abi_1.loadAbiFromEtherscan)(ABI, network, fromContract);
                        }
                    }
                    catch (e) {
                        process.exitCode = 1;
                        return;
                    }
                }
            }
            return await initSubgraphFromContract.bind(this)({
                protocolInstance,
                abi,
                allowSimpleName,
                directory,
                contract: fromContract,
                indexEvents,
                network,
                subgraphName,
                contractName,
                node,
                studio,
                product,
                startBlock,
            }, { commands, addContract: false });
        }
        // Otherwise, take the user through the interactive form
        const answers = await processInitForm.bind(this)({
            protocol: protocol,
            product,
            studio,
            node,
            abi,
            allowSimpleName,
            directory,
            contract: fromContract,
            indexEvents,
            fromExample,
            network,
            subgraphName,
            contractName,
            startBlock,
        });
        if (!answers) {
            this.exit(1);
            return;
        }
        if (fromExample) {
            await initSubgraphFromExample.bind(this)({
                fromExample,
                subgraphName: answers.subgraphName,
                directory: answers.directory,
                studio: answers.studio,
                product: answers.product,
            }, { commands });
        }
        else {
            ({ node, allowSimpleName } = (0, node_1.chooseNodeUrl)({
                product: answers.product,
                studio: answers.studio,
                node,
                allowSimpleName,
            }));
            await initSubgraphFromContract.bind(this)({
                protocolInstance: answers.protocolInstance,
                allowSimpleName,
                subgraphName: answers.subgraphName,
                directory: answers.directory,
                abi: answers.abi,
                network: answers.network,
                contract: answers.contract,
                indexEvents: answers.indexEvents,
                contractName: answers.contractName,
                node,
                studio: answers.studio,
                product: answers.product,
                startBlock: answers.startBlock,
            }, { commands, addContract: true });
        }
    }
}
InitCommand.description = 'Creates a new subgraph with basic scaffolding.';
InitCommand.args = {
    subgraphName: core_1.Args.string(),
    directory: core_1.Args.string(),
};
InitCommand.flags = {
    help: core_1.Flags.help({
        char: 'h',
    }),
    protocol: core_1.Flags.string({
        options: protocolChoices,
    }),
    product: core_1.Flags.string({
        summary: 'Selects the product for which to initialize.',
        options: ['subgraph-studio', 'hosted-service'],
    }),
    studio: core_1.Flags.boolean({
        summary: 'Shortcut for "--product subgraph-studio".',
        exclusive: ['product'],
    }),
    node: core_1.Flags.string({
        summary: 'Graph node for which to initialize.',
        char: 'g',
    }),
    'allow-simple-name': core_1.Flags.boolean({
        description: 'Use a subgraph name without a prefix.',
        default: false,
    }),
    'from-contract': core_1.Flags.string({
        description: 'Creates a scaffold based on an existing contract.',
        exclusive: ['from-example'],
    }),
    'from-example': core_1.Flags.string({
        description: 'Creates a scaffold based on an example subgraph.',
        // TODO: using a default sets the value and therefore requires not to have --from-contract
        // default: 'Contract',
        exclusive: ['from-contract'],
    }),
    'contract-name': core_1.Flags.string({
        helpGroup: 'Scaffold from contract',
        description: 'Name of the contract.',
        dependsOn: ['from-contract'],
    }),
    'index-events': core_1.Flags.boolean({
        helpGroup: 'Scaffold from contract',
        description: 'Index contract events as entities.',
        dependsOn: ['from-contract'],
    }),
    'start-block': core_1.Flags.string({
        helpGroup: 'Scaffold from contract',
        description: 'Block number to start indexing from.',
        // TODO: using a default sets the value and therefore requires --from-contract
        // default: '0',
        dependsOn: ['from-contract'],
    }),
    abi: core_1.Flags.string({
        summary: 'Path to the contract ABI',
        // TODO: using a default sets the value and therefore requires --from-contract
        // default: '*Download from Etherscan*',
        dependsOn: ['from-contract'],
    }),
    network: core_1.Flags.string({
        summary: 'Network the contract is deployed to.',
        dependsOn: ['from-contract'],
        options: [
            ...availableNetworks.get('ethereum'),
            ...availableNetworks.get('near'),
            ...availableNetworks.get('cosmos'),
        ],
    }),
};
exports.default = InitCommand;
async function processInitForm({ protocol, product, studio, node, abi, allowSimpleName, directory, contract, indexEvents, fromExample, network, subgraphName, contractName, startBlock, }) {
    let abiFromEtherscan = undefined;
    let abiFromFile = undefined;
    let protocolInstance;
    let ProtocolContract;
    let ABI;
    const questions = [
        {
            type: 'select',
            name: 'protocol',
            message: 'Protocol',
            choices: protocolChoices,
            skip: protocolChoices.includes(String(protocol)),
            result: (value) => {
                // eslint-disable-next-line -- prettier has problems with ||=
                protocol = protocol || value;
                protocolInstance = new protocols_1.default(protocol);
                return protocol;
            },
        },
        {
            type: 'select',
            name: 'product',
            message: 'Product for which to initialize',
            choices: ['subgraph-studio', 'hosted-service'],
            skip: () => protocol === 'arweave' ||
                protocol === 'cosmos' ||
                protocol === 'near' ||
                product === 'subgraph-studio' ||
                product === 'hosted-service' ||
                studio !== undefined ||
                node !== undefined,
            result: (value) => {
                // For now we only support NEAR subgraphs in the Hosted Service
                if (protocol === 'near') {
                    // Can be overwritten because the question will be skipped (product === undefined)
                    product = 'hosted-service';
                    return product;
                }
                if (value == 'subgraph-studio') {
                    allowSimpleName = true;
                }
                product = value;
                return value;
            },
        },
        {
            type: 'input',
            name: 'subgraphName',
            message: () => (product == 'subgraph-studio' || studio ? 'Subgraph slug' : 'Subgraph name'),
            initial: subgraphName,
            validate: (name) => {
                try {
                    (0, subgraph_1.validateSubgraphName)(name, { allowSimpleName });
                    return true;
                }
                catch (e) {
                    return `${e.message}

  Examples:

    $ graph init ${os_1.default.userInfo().username}/${name}
    $ graph init ${name} --allow-simple-name`;
                }
            },
            result: (value) => {
                subgraphName = value;
                return value;
            },
        },
        {
            type: 'input',
            name: 'directory',
            message: 'Directory to create the subgraph in',
            initial: () => directory ||
                (0, subgraph_1.getSubgraphBasename)(
                // @ts-expect-error will be set by previous question
                subgraphName),
            validate: (value) => gluegun_1.filesystem.exists(value ||
                directory ||
                (0, subgraph_1.getSubgraphBasename)(
                // @ts-expect-error will be set by previous question
                subgraphName))
                ? 'Directory already exists'
                : true,
        },
        {
            type: 'select',
            name: 'network',
            message: () => `${protocolInstance.displayName()} network`,
            choices: () => {
                initDebug('Generating list of available networks for protocol "%s" (%M)', protocol, availableNetworks.get(protocol));
                return (
                // @ts-expect-error TODO: wait what?
                availableNetworks
                    .get(protocol) // Get networks related to the chosen protocol.
                    .toArray()); // Needed because of gluegun. It can't even receive a JS iterable.
            },
            skip: fromExample !== undefined,
            initial: network || 'mainnet',
            result: (value) => {
                network = value;
                return value;
            },
        },
        // TODO:
        //
        // protocols that don't support contract
        // - arweave
        // - cosmos
        {
            type: 'input',
            name: 'contract',
            message: () => {
                ProtocolContract = protocolInstance.getContract();
                return `Contract ${ProtocolContract.identifierName()}`;
            },
            skip: () => fromExample !== undefined || !protocolInstance.hasContract(),
            initial: contract,
            validate: async (value) => {
                if (fromExample !== undefined || !protocolInstance.hasContract()) {
                    return true;
                }
                // Validate whether the contract is valid
                const { valid, error } = (0, validation_1.validateContract)(value, ProtocolContract);
                return valid ? true : error;
            },
            result: async (value) => {
                if (fromExample !== undefined) {
                    return value;
                }
                ABI = protocolInstance.getABI();
                // Try loading the ABI from Etherscan, if none was provided
                if (protocolInstance.hasABIs() && !abi) {
                    try {
                        if (network === 'poa-core') {
                            // TODO: this variable is never used anywhere, what happens?
                            // abiFromBlockScout = await loadAbiFromBlockScout(ABI, network, value)
                        }
                        else {
                            abiFromEtherscan = await (0, abi_1.loadAbiFromEtherscan)(ABI, network, value);
                        }
                    }
                    catch (e) {
                        // noop
                    }
                }
                // If startBlock is not set, try to load it.
                if (!startBlock) {
                    try {
                        // Load startBlock for this contract
                        startBlock = Number(await (0, abi_1.loadStartBlockForContract)(network, value)).toString();
                    }
                    catch (error) {
                        // noop
                    }
                }
                return value;
            },
        },
        {
            type: 'input',
            name: 'abi',
            message: 'ABI file (path)',
            initial: abi,
            skip: () => !protocolInstance.hasABIs() || fromExample !== undefined || abiFromEtherscan !== undefined,
            validate: async (value) => {
                if (fromExample || abiFromEtherscan || !protocolInstance.hasABIs()) {
                    return true;
                }
                try {
                    abiFromFile = loadAbiFromFile(ABI, value);
                    return true;
                }
                catch (e) {
                    return e.message;
                }
            },
        },
        {
            type: 'input',
            name: 'startBlock',
            message: 'Start Block',
            initial: () => startBlock || '0',
            skip: () => fromExample !== undefined,
            validate: (value) => parseInt(value) >= 0,
            result: (value) => {
                startBlock = value;
                return value;
            },
        },
        {
            type: 'input',
            name: 'contractName',
            message: 'Contract Name',
            initial: contractName || 'Contract',
            skip: () => fromExample !== undefined || !protocolInstance.hasContract(),
            validate: (value) => value && value.length > 0,
            result: (value) => {
                contractName = value;
                return value;
            },
        },
        {
            type: 'confirm',
            name: 'indexEvents',
            message: 'Index contract events as entities',
            initial: true,
            skip: () => !!indexEvents,
            result: (value) => {
                indexEvents = value;
                return value;
            },
        },
    ];
    try {
        const answers = await gluegun_1.prompt.ask(questions);
        return {
            ...answers,
            abi: abiFromEtherscan || abiFromFile,
            protocolInstance,
        };
    }
    catch (e) {
        this.error(e, { exit: 1 });
    }
}
const loadAbiFromFile = (ABI, filename) => {
    const exists = gluegun_1.filesystem.exists(filename);
    if (!exists) {
        throw Error('File does not exist.');
    }
    else if (exists === 'dir') {
        throw Error('Path points to a directory, not a file.');
    }
    else if (exists === 'other') {
        throw Error('Not sure what this path points to.');
    }
    else {
        return ABI.load('Contract', filename);
    }
};
function revalidateSubgraphName(subgraphName, { allowSimpleName }) {
    // Fail if the subgraph name is invalid
    try {
        (0, subgraph_1.validateSubgraphName)(subgraphName, { allowSimpleName });
        return true;
    }
    catch (e) {
        this.error(`${e.message}

  Examples:

    $ graph init ${os_1.default.userInfo().username}/${subgraphName}
    $ graph init ${subgraphName} --allow-simple-name`);
    }
}
const initRepository = async (directory) => await (0, spinner_1.withSpinner)(`Initialize subgraph repository`, `Failed to initialize subgraph repository`, `Warnings while initializing subgraph repository`, async () => {
    // Remove .git dir in --from-example mode; in --from-contract, we're
    // starting from an empty directory
    const gitDir = path_1.default.join(directory, '.git');
    if (gluegun_1.filesystem.exists(gitDir)) {
        gluegun_1.filesystem.remove(gitDir);
    }
    await gluegun_1.system.run('git init', { cwd: directory });
    await gluegun_1.system.run('git add --all', { cwd: directory });
    await gluegun_1.system.run('git commit -m "Initial commit"', {
        cwd: directory,
    });
    return true;
});
const installDependencies = async (directory, commands) => await (0, spinner_1.withSpinner)(`Install dependencies with ${commands.install}`, `Failed to install dependencies`, `Warnings while installing dependencies`, async () => {
    if (process.env.GRAPH_CLI_TESTS) {
        await gluegun_1.system.run(commands.link, { cwd: directory });
    }
    await gluegun_1.system.run(commands.install, { cwd: directory });
    return true;
});
const runCodegen = async (directory, codegenCommand) => await (0, spinner_1.withSpinner)(`Generate ABI and schema types with ${codegenCommand}`, `Failed to generate code from ABI and GraphQL schema`, `Warnings while generating code from ABI and GraphQL schema`, async () => {
    await gluegun_1.system.run(codegenCommand, { cwd: directory });
    return true;
});
function printNextSteps({ subgraphName, directory }, { commands, }) {
    const relativeDir = path_1.default.relative(process.cwd(), directory);
    // Print instructions
    this.log(`
Subgraph ${subgraphName} created in ${relativeDir}
`);
    this.log(`Next steps:

  1. Run \`graph auth\` to authenticate with your deploy key.

  2. Type \`cd ${relativeDir}\` to enter the subgraph.

  3. Run \`${commands.deploy}\` to deploy the subgraph.

Make sure to visit the documentation on https://thegraph.com/docs/ for further information.`);
}
async function initSubgraphFromExample({ fromExample, allowSimpleName, subgraphName, directory, studio, product, }, { commands, }) {
    // Fail if the subgraph name is invalid
    if (!revalidateSubgraphName.bind(this)(subgraphName, { allowSimpleName })) {
        process.exitCode = 1;
        return;
    }
    // Fail if the output directory already exists
    if (gluegun_1.filesystem.exists(directory)) {
        this.error(`Directory or file "${directory}" already exists`, { exit: 1 });
    }
    // Clone the example subgraph repository
    const cloned = await (0, spinner_1.withSpinner)(`Cloning example subgraph`, `Failed to clone example subgraph`, `Warnings while cloning example subgraph`, async () => {
        // Create a temporary directory
        const prefix = path_1.default.join(os_1.default.tmpdir(), 'example-subgraph-');
        const tmpDir = fs_1.default.mkdtempSync(prefix);
        try {
            await gluegun_1.system.run(`git clone http://github.com/graphprotocol/example-subgraphs ${tmpDir}`);
            // If an example is not specified, use the default one
            if (fromExample === undefined || fromExample === true) {
                fromExample = DEFAULT_EXAMPLE_SUBGRAPH;
            }
            const exampleSubgraphPath = path_1.default.join(tmpDir, String(fromExample));
            if (!gluegun_1.filesystem.exists(exampleSubgraphPath)) {
                return { result: false, error: `Example not found: ${fromExample}` };
            }
            gluegun_1.filesystem.copy(exampleSubgraphPath, directory);
            return true;
        }
        finally {
            gluegun_1.filesystem.remove(tmpDir);
        }
    });
    if (!cloned) {
        this.exit(1);
        return;
    }
    try {
        // It doesn't matter if we changed the URL we clone the YAML,
        // we'll check it's network anyway. If it's a studio subgraph we're dealing with.
        const dataSourcesAndTemplates = await DataSourcesExtractor.fromFilePath(path_1.default.join(directory, 'subgraph.yaml'));
        for (const { network } of dataSourcesAndTemplates) {
            (0, studio_1.validateStudioNetwork)({ studio, product, network });
        }
    }
    catch (e) {
        this.error(e.message, { exit: 1 });
    }
    const networkConf = await (0, network_1.initNetworksConfig)(directory, 'address');
    if (networkConf !== true) {
        this.exit(1);
        return;
    }
    // Update package.json to match the subgraph name
    const prepared = await (0, spinner_1.withSpinner)(`Update subgraph name and commands in package.json`, `Failed to update subgraph name and commands in package.json`, `Warnings while updating subgraph name and commands in package.json`, async () => {
        try {
            // Load package.json
            const pkgJsonFilename = gluegun_1.filesystem.path(directory, 'package.json');
            const pkgJson = await gluegun_1.filesystem.read(pkgJsonFilename, 'json');
            pkgJson.name = (0, subgraph_1.getSubgraphBasename)(subgraphName);
            for (const name of Object.keys(pkgJson.scripts)) {
                pkgJson.scripts[name] = pkgJson.scripts[name].replace('example', subgraphName);
            }
            delete pkgJson['license'];
            delete pkgJson['repository'];
            // Remove example's cli in favor of the local one (added via `npm link`)
            if (process.env.GRAPH_CLI_TESTS) {
                delete pkgJson['devDependencies']['@graphprotocol/graph-cli'];
            }
            // Write package.json
            gluegun_1.filesystem.write(pkgJsonFilename, pkgJson, { jsonIndent: 2 });
            return true;
        }
        catch (e) {
            gluegun_1.filesystem.remove(directory);
            this.error(`Failed to preconfigure the subgraph: ${e}`);
        }
    });
    if (!prepared) {
        this.exit(1);
        return;
    }
    // Initialize a fresh Git repository
    const repo = await initRepository(directory);
    if (repo !== true) {
        this.exit(1);
        return;
    }
    // Install dependencies
    const installed = await installDependencies(directory, commands);
    if (installed !== true) {
        this.exit(1);
        return;
    }
    // Run code-generation
    const codegen = await runCodegen(directory, commands.codegen);
    if (codegen !== true) {
        this.exit(1);
        return;
    }
    printNextSteps.bind(this)({ subgraphName, directory }, { commands });
}
async function initSubgraphFromContract({ protocolInstance, allowSimpleName, subgraphName, directory, abi, network, contract, indexEvents, contractName, node, studio, product, startBlock, }, { commands, addContract, }) {
    // Fail if the subgraph name is invalid
    if (!revalidateSubgraphName.bind(this)(subgraphName, { allowSimpleName })) {
        this.exit(1);
        return;
    }
    // Fail if the output directory already exists
    if (gluegun_1.filesystem.exists(directory)) {
        this.error(`Directory or file "${directory}" already exists`, { exit: 1 });
    }
    if (protocolInstance.hasABIs() &&
        ((0, schema_1.abiEvents)(abi).size === 0 ||
            // @ts-expect-error TODO: the abiEvents result is expected to be a List, how's it an array?
            (0, schema_1.abiEvents)(abi).length === 0)) {
        // Fail if the ABI does not contain any events
        this.error(`ABI does not contain any events`, { exit: 1 });
    }
    // We can validate this before the scaffold because we receive
    // the network from the form or via command line argument.
    // We don't need to read the manifest in this case.
    try {
        (0, studio_1.validateStudioNetwork)({ studio, product, network });
    }
    catch (e) {
        this.error(e, { exit: 1 });
    }
    // Scaffold subgraph
    const scaffold = await (0, spinner_1.withSpinner)(`Create subgraph scaffold`, `Failed to create subgraph scaffold`, `Warnings while creating subgraph scaffold`, async (spinner) => {
        const scaffold = await (0, scaffold_1.generateScaffold)({
            protocolInstance,
            subgraphName,
            abi,
            network,
            contract,
            indexEvents,
            contractName,
            startBlock,
            node,
        }, spinner);
        await (0, scaffold_1.writeScaffold)(scaffold, directory, spinner);
        return true;
    });
    if (scaffold !== true) {
        process.exitCode = 1;
        return;
    }
    if (protocolInstance.hasContract()) {
        const identifierName = protocolInstance.getContract().identifierName();
        const networkConf = await (0, network_1.initNetworksConfig)(directory, identifierName);
        if (networkConf !== true) {
            process.exitCode = 1;
            return;
        }
    }
    // Initialize a fresh Git repository
    const repo = await initRepository(directory);
    if (repo !== true) {
        this.exit(1);
        return;
    }
    // Install dependencies
    const installed = await installDependencies(directory, commands);
    if (installed !== true) {
        this.exit(1);
        return;
    }
    // Run code-generation
    const codegen = await runCodegen(directory, commands.codegen);
    if (codegen !== true) {
        this.exit(1);
        return;
    }
    while (addContract) {
        addContract = await addAnotherContract.bind(this)({ protocolInstance, directory });
    }
    printNextSteps.bind(this)({ subgraphName, directory }, { commands });
}
async function addAnotherContract({ protocolInstance, directory, }) {
    const addContractAnswer = await core_1.ux.prompt('Add another contract? (y/n)', {
        required: true,
        type: 'single',
    });
    const addContractConfirmation = addContractAnswer.toLowerCase() === 'y';
    if (addContractConfirmation) {
        let abiFromFile = false;
        const ProtocolContract = protocolInstance.getContract();
        let contract = '';
        for (;;) {
            contract = await core_1.ux.prompt(`\nContract ${ProtocolContract.identifierName()}`, {
                required: true,
            });
            const { valid, error } = (0, validation_1.validateContract)(contract, ProtocolContract);
            if (valid) {
                break;
            }
            this.log(`✖ ${error}`);
        }
        const localAbi = await core_1.ux.prompt('\nProvide local ABI path? (y/n)', {
            required: true,
            type: 'single',
        });
        abiFromFile = localAbi.toLowerCase() === 'y';
        let abiPath = '';
        if (abiFromFile) {
            abiPath = await core_1.ux.prompt('\nABI file (path)', { required: true });
        }
        const contractName = await core_1.ux.prompt('\nContract Name', {
            required: true,
            default: 'Contract',
        });
        // Get the cwd before process.chdir in order to switch back in the end of command execution
        const cwd = process.cwd();
        try {
            if (fs_1.default.existsSync(directory)) {
                process.chdir(directory);
            }
            const commandLine = [contract, '--contract-name', contractName];
            if (abiFromFile) {
                if (abiPath.includes(directory)) {
                    commandLine.push('--abi', path_1.default.normalize(abiPath.replace(directory, '')));
                }
                else {
                    commandLine.push('--abi', abiPath);
                }
            }
            await add_1.default.run(commandLine);
        }
        catch (e) {
            this.error(e);
        }
        finally {
            // TODO: safer way of doing this?
            process.chdir(cwd);
        }
    }
    return addContractConfirmation;
}

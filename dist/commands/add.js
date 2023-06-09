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
const core_1 = require("@oclif/core");
const errors_1 = require("@oclif/core/lib/errors");
const gluegun_1 = require("gluegun");
const immutable_1 = __importDefault(require("immutable"));
const abi_1 = require("../command-helpers/abi");
const DataSourcesExtractor = __importStar(require("../command-helpers/data-sources"));
const network_1 = require("../command-helpers/network");
const scaffold_1 = require("../command-helpers/scaffold");
const spinner_1 = require("../command-helpers/spinner");
const protocols_1 = __importDefault(require("../protocols"));
const abi_2 = __importDefault(require("../protocols/ethereum/abi"));
const subgraph_1 = __importDefault(require("../subgraph"));
class AddCommand extends core_1.Command {
    async run() {
        const { args: { address, 'subgraph-manifest': manifestPath }, flags: { abi, 'contract-name': contractName, 'merge-entities': mergeEntities, 'network-file': networksFile, 'start-block': startBlockFlag, }, } = await this.parse(AddCommand);
        const dataSourcesAndTemplates = await DataSourcesExtractor.fromFilePath(manifestPath);
        const protocol = protocols_1.default.fromDataSources(dataSourcesAndTemplates);
        const manifest = await subgraph_1.default.load(manifestPath, { protocol });
        const network = manifest.result.getIn(['dataSources', 0, 'network']);
        const result = manifest.result.asMutable();
        let startBlock = startBlockFlag;
        const entities = getEntities(manifest);
        const contractNames = getContractNames(manifest);
        if (contractNames.includes(contractName)) {
            this.error(`Datasource or template with name ${contractName} already exists, please choose a different name.`, { exit: 1 });
        }
        let ethabi = null;
        if (abi) {
            ethabi = abi_2.default.load(contractName, abi);
        }
        else if (network === 'poa-core') {
            ethabi = await (0, abi_1.loadAbiFromBlockScout)(abi_2.default, network, address);
        }
        else {
            ethabi = await (0, abi_1.loadAbiFromEtherscan)(abi_2.default, network, address);
        }
        try {
            startBlock || (startBlock = Number(await (0, abi_1.loadStartBlockForContract)(network, address)).toString());
        }
        catch (error) {
            // If we can't get the start block, we'll just leave it out of the manifest
            // TODO: Ask the user for the start block
        }
        await (0, scaffold_1.writeABI)(ethabi, contractName);
        const { collisionEntities, onlyCollisions, abiData } = updateEventNamesOnCollision(ethabi, entities, contractName, mergeEntities);
        ethabi.data = abiData;
        await (0, scaffold_1.writeSchema)(ethabi, protocol, result.getIn(['schema', 'file']), collisionEntities, contractName);
        await (0, scaffold_1.writeMapping)(ethabi, protocol, contractName, collisionEntities);
        await (0, scaffold_1.writeTestsFiles)(ethabi, protocol, contractName);
        const dataSources = result.get('dataSources');
        const dataSource = await (0, scaffold_1.generateDataSource)(protocol, contractName, network, address, ethabi, startBlock);
        // Handle the collisions edge case by copying another data source yaml data
        if (mergeEntities && onlyCollisions) {
            const firstDataSource = dataSources.get(0);
            const source = dataSource.get('source');
            const mapping = firstDataSource.get('mapping').asMutable();
            // Save the address of the new data source
            source.abi = firstDataSource.get('source').get('abi');
            dataSource.set('mapping', mapping);
            dataSource.set('source', source);
        }
        result.set('dataSources', dataSources.push(dataSource));
        await subgraph_1.default.write(result, manifestPath);
        // Update networks.json
        await (0, network_1.updateNetworksFile)(network, contractName, address, networksFile);
        // Detect Yarn and/or NPM
        const yarn = gluegun_1.system.which('yarn');
        const npm = gluegun_1.system.which('npm');
        if (!yarn && !npm) {
            this.error('Neither Yarn nor NPM were found on your system. Please install one of them.', {
                exit: 1,
            });
        }
        await (0, spinner_1.withSpinner)('Running codegen', 'Failed to run codegen', 'Warning during codegen', () => gluegun_1.system.run(yarn ? 'yarn codegen' : 'npm run codegen'));
    }
}
AddCommand.description = 'Adds a new datasource to a subgraph.';
AddCommand.args = {
    address: core_1.Args.string({
        description: 'The contract address',
        required: true,
    }),
    'subgraph-manifest': core_1.Args.string({
        default: 'subgraph.yaml',
    }),
};
AddCommand.flags = {
    help: core_1.Flags.help({
        char: 'h',
    }),
    abi: core_1.Flags.string({
        summary: 'Path to the contract ABI.',
    }),
    'start-block': core_1.Flags.string({
        summary: 'The block number to start indexing events from.',
    }),
    'contract-name': core_1.Flags.string({
        summary: 'Name of the contract.',
        default: 'Contract',
    }),
    'merge-entities': core_1.Flags.boolean({
        summary: 'Whether to merge entities with the same name.',
        default: false,
    }),
    // TODO: should be networksFile (with an "s"), or?
    'network-file': core_1.Flags.file({
        summary: 'Networks config file path.',
        default: 'networks.json',
    }),
};
exports.default = AddCommand;
const getEntities = (manifest) => {
    const dataSources = manifest.result.get('dataSources', immutable_1.default.List());
    const templates = manifest.result.get('templates', immutable_1.default.List());
    return dataSources
        .concat(templates)
        .map((dataSource) => dataSource.getIn(['mapping', 'entities']))
        .flatten();
};
const getContractNames = (manifest) => {
    const dataSources = manifest.result.get('dataSources', immutable_1.default.List());
    const templates = manifest.result.get('templates', immutable_1.default.List());
    return dataSources.concat(templates).map((dataSource) => dataSource.get('name'));
};
const updateEventNamesOnCollision = (ethabi, entities, contractName, mergeEntities) => {
    let abiData = ethabi.data;
    const collisionEntities = [];
    let onlyCollisions = true;
    for (let i = 0; i < abiData.size; i++) {
        const dataRow = abiData.get(i).asMutable();
        if (dataRow.get('type') === 'event') {
            if (entities.includes(dataRow.get('name'))) {
                if (entities.includes(`${contractName}${dataRow.get('name')}`)) {
                    throw new errors_1.CLIError(`Contract name ('${contractName}') + event name ('${dataRow.get('name')}') entity already exists.`, { exit: 1 });
                }
                if (mergeEntities) {
                    collisionEntities.push(dataRow.get('name'));
                    abiData = abiData.asImmutable().delete(i); // needs to be immutable when deleting, yes you read that right - https://github.com/immutable-js/immutable-js/issues/1901
                    i--; // deletion also shifts values to the left
                    continue;
                }
                else {
                    dataRow.set('collision', true);
                }
            }
            else {
                onlyCollisions = false;
            }
        }
        abiData = abiData.asMutable().set(i, dataRow);
    }
    return { abiData, collisionEntities, onlyCollisions };
};

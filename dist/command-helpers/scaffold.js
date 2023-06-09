"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeTestsFiles = exports.writeMapping = exports.writeSchema = exports.writeABI = exports.writeScaffold = exports.generateScaffold = exports.generateDataSource = void 0;
const path_1 = __importDefault(require("path"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const gluegun_1 = require("gluegun");
const immutable_1 = require("immutable");
const prettier_1 = __importDefault(require("prettier"));
const yaml_1 = __importDefault(require("yaml"));
const scaffold_1 = __importDefault(require("../scaffold"));
const mapping_1 = require("../scaffold/mapping");
const schema_1 = require("../scaffold/schema");
const tests_1 = require("../scaffold/tests");
const spinner_1 = require("./spinner");
const generateDataSource = async (protocol, contractName, network, contractAddress, abi, startBlock) => {
    const protocolManifest = protocol.getManifestScaffold();
    return immutable_1.Map.of('kind', protocol.name, 'name', contractName, 'network', network, 'source', yaml_1.default.parse(prettier_1.default.format(protocolManifest.source({ contract: contractAddress, contractName, startBlock }), {
        parser: 'yaml',
    })), 'mapping', yaml_1.default.parse(prettier_1.default.format(protocolManifest.mapping({ abi, contractName }), {
        parser: 'yaml',
    }))).asMutable();
};
exports.generateDataSource = generateDataSource;
const generateScaffold = async ({ protocolInstance, abi, contract, network, subgraphName, indexEvents, contractName = 'Contract', startBlock, node, }, spinner) => {
    (0, spinner_1.step)(spinner, 'Generate subgraph');
    const scaffold = new scaffold_1.default({
        protocol: protocolInstance,
        abi,
        indexEvents,
        contract,
        network,
        contractName,
        startBlock,
        subgraphName,
        node,
    });
    return scaffold.generate();
};
exports.generateScaffold = generateScaffold;
const writeScaffoldDirectory = async (scaffold, directory, spinner) => {
    // Create directory itself
    await fs_extra_1.default.mkdirs(directory);
    const promises = Object.keys(scaffold).map(async (basename) => {
        const content = scaffold[basename];
        const filename = path_1.default.join(directory, basename);
        // Write file or recurse into subdirectory
        if (typeof content === 'string') {
            await fs_extra_1.default.writeFile(filename, content, 'utf-8');
        }
        else if (content == null) {
            return; // continue loop
        }
        else {
            writeScaffoldDirectory(content, path_1.default.join(directory, basename), spinner);
        }
    });
    await Promise.all(promises);
};
const writeScaffold = async (scaffold, directory, spinner) => {
    (0, spinner_1.step)(spinner, `Write subgraph to directory`);
    await writeScaffoldDirectory(scaffold, directory, spinner);
};
exports.writeScaffold = writeScaffold;
const writeABI = async (abi, contractName) => {
    const data = prettier_1.default.format(JSON.stringify(abi.data), {
        parser: 'json',
    });
    await fs_extra_1.default.writeFile(`./abis/${contractName}.json`, data, 'utf-8');
};
exports.writeABI = writeABI;
const writeSchema = async (abi, protocol, schemaPath, entities, contractName) => {
    const events = protocol.hasEvents()
        ? (0, schema_1.abiEvents)(abi)
            .filter(event => !entities.includes(event.get('name')))
            .toJS()
        : [];
    const data = prettier_1.default.format(events.map(event => (0, schema_1.generateEventType)(event, protocol.name, contractName)).join('\n\n'), {
        parser: 'graphql',
    });
    await fs_extra_1.default.appendFile(schemaPath, data, { encoding: 'utf-8' });
};
exports.writeSchema = writeSchema;
const writeMapping = async (abi, protocol, contractName, entities) => {
    const events = protocol.hasEvents()
        ? (0, schema_1.abiEvents)(abi)
            .filter(event => !entities.includes(event.get('name')))
            .toJS()
        : [];
    const mapping = prettier_1.default.format((0, mapping_1.generateEventIndexingHandlers)(events, contractName), {
        parser: 'typescript',
        semi: false,
    });
    await fs_extra_1.default.writeFile(`./src/${gluegun_1.strings.kebabCase(contractName)}.ts`, mapping, 'utf-8');
};
exports.writeMapping = writeMapping;
const writeTestsFiles = async (abi, protocol, contractName) => {
    const hasEvents = protocol.hasEvents();
    const events = hasEvents ? (0, schema_1.abiEvents)(abi).toJS() : [];
    if (events.length > 0) {
        // If a contract is added to a subgraph that has no tests folder
        await fs_extra_1.default.ensureDir('./tests/');
        const testsFiles = (0, tests_1.generateTestsFiles)(contractName, events, true);
        for (const [fileName, content] of Object.entries(testsFiles)) {
            await fs_extra_1.default.writeFile(`./tests/${fileName}`, content, 'utf-8');
        }
    }
};
exports.writeTestsFiles = writeTestsFiles;

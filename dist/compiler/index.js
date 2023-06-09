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
const crypto_1 = __importDefault(require("crypto"));
const path_1 = __importDefault(require("path"));
const chalk_1 = __importDefault(require("chalk"));
const fs_extra_1 = __importDefault(require("fs-extra"));
const toolbox = __importStar(require("gluegun"));
const immutable_1 = __importDefault(require("immutable"));
const js_yaml_1 = __importDefault(require("js-yaml"));
const spinner_1 = require("../command-helpers/spinner");
const debug_1 = __importDefault(require("../debug"));
const migrations_1 = require("../migrations");
const subgraph_1 = __importDefault(require("../subgraph"));
const watcher_1 = __importDefault(require("../watcher"));
const asc = __importStar(require("./asc"));
const compilerDebug = (0, debug_1.default)('graph-cli:compiler');
class Compiler {
    constructor(options) {
        this.options = options;
        this.options = options;
        this.ipfs = options.ipfs;
        this.sourceDir = path_1.default.dirname(options.subgraphManifest);
        this.blockIpfsMethods = options.blockIpfsMethods;
        this.libsDirs = [];
        this.protocol = this.options.protocol;
        this.ABI = this.protocol.getABI();
        if (options.protocol.name === 'substreams') {
            return;
        }
        for (let dir = path_1.default.resolve(this.sourceDir); 
        // Terminate after the root dir or when we have found node_modules
        dir !== undefined; 
        // Continue with the parent directory, terminate after the root dir
        dir = path_1.default.dirname(dir) === dir ? undefined : path_1.default.dirname(dir)) {
            if (fs_extra_1.default.existsSync(path_1.default.join(dir, 'node_modules'))) {
                this.libsDirs.push(path_1.default.join(dir, 'node_modules'));
            }
        }
        if (this.libsDirs.length === 0) {
            throw Error(`could not locate \`node_modules\` in parent directories of subgraph manifest`);
        }
        const globalsFile = path_1.default.join('@graphprotocol', 'graph-ts', 'global', 'global.ts');
        const globalsLib = this.libsDirs.find(item => {
            return fs_extra_1.default.existsSync(path_1.default.join(item, globalsFile));
        });
        if (!globalsLib) {
            throw Error('Could not locate `@graphprotocol/graph-ts` package in parent directories of subgraph manifest.');
        }
        this.globalsFile = path_1.default.join(globalsLib, globalsFile);
        process.on('uncaughtException', e => {
            toolbox.print.error(`UNCAUGHT EXCEPTION: ${e}`);
        });
    }
    subgraphDir(parent, subgraph) {
        return path_1.default.join(parent, subgraph.get('name'));
    }
    displayPath(p) {
        return path_1.default.relative(process.cwd(), p);
    }
    cacheKeyForFile(filename) {
        const hash = crypto_1.default.createHash('sha1');
        hash.update(fs_extra_1.default.readFileSync(filename));
        return hash.digest('hex');
    }
    async compile() {
        try {
            if (!this.options.skipMigrations) {
                await (0, migrations_1.applyMigrations)({
                    sourceDir: this.sourceDir,
                    manifestFile: this.options.subgraphManifest,
                });
            }
            const subgraph = await this.loadSubgraph();
            const compiledSubgraph = await this.compileSubgraph(subgraph);
            const localSubgraph = await this.writeSubgraphToOutputDirectory(this.options.protocol, compiledSubgraph);
            if (this.ipfs !== undefined) {
                const ipfsHash = await this.uploadSubgraphToIPFS(localSubgraph);
                this.completed(ipfsHash);
                return ipfsHash;
            }
            this.completed(path_1.default.join(this.options.outputDir, 'subgraph.yaml'));
            return true;
        }
        catch (e) {
            toolbox.print.error(e);
            return false;
        }
    }
    completed(ipfsHashOrPath) {
        toolbox.print.info('');
        toolbox.print.success(`Build completed: ${chalk_1.default.blue(ipfsHashOrPath)}`);
        toolbox.print.info('');
    }
    async loadSubgraph({ quiet } = { quiet: false }) {
        const subgraphLoadOptions = { protocol: this.protocol, skipValidation: false };
        if (quiet) {
            return (await subgraph_1.default.load(this.options.subgraphManifest, subgraphLoadOptions)).result;
        }
        const manifestPath = this.displayPath(this.options.subgraphManifest);
        return await (0, spinner_1.withSpinner)(`Load subgraph from ${manifestPath}`, `Failed to load subgraph from ${manifestPath}`, `Warnings loading subgraph from ${manifestPath}`, async () => {
            return subgraph_1.default.load(this.options.subgraphManifest, subgraphLoadOptions);
        });
    }
    async getFilesToWatch() {
        try {
            const files = [];
            const subgraph = await this.loadSubgraph({ quiet: true });
            // Add the subgraph manifest file
            files.push(this.options.subgraphManifest);
            // Add all file paths specified in manifest
            files.push(path_1.default.resolve(subgraph.getIn(['schema', 'file'])));
            subgraph.get('dataSources').map((dataSource) => {
                files.push(dataSource.getIn(['mapping', 'file']));
                // Only watch ABI related files if the target protocol has support/need for them.
                if (this.protocol.hasABIs()) {
                    dataSource.getIn(['mapping', 'abis']).map((abi) => {
                        files.push(abi.get('file'));
                    });
                }
            });
            // Make paths absolute
            return files.map(file => path_1.default.resolve(file));
        }
        catch (e) {
            throw Error(`Failed to load subgraph: ${e.message}`);
        }
    }
    async watchAndCompile(onCompiled) {
        const compiler = this;
        let spinner;
        // Create watcher and recompile once and then on every change to a watched file
        const watcher = new watcher_1.default({
            onReady: () => (spinner = toolbox.print.spin('Watching subgraph files')),
            onTrigger: async (changedFile) => {
                if (changedFile !== undefined) {
                    spinner.info(`File change detected: ${this.displayPath(changedFile)}\n`);
                }
                const ipfsHash = await compiler.compile();
                onCompiled?.(ipfsHash);
                spinner.start();
            },
            onCollectFiles: async () => await compiler.getFilesToWatch(),
            onError: error => {
                spinner.stop();
                toolbox.print.error(`${error.message}\n`);
                spinner.start();
            },
        });
        // Catch keyboard interrupt: close watcher and exit process
        process.on('SIGINT', () => {
            watcher.close();
            process.exit();
        });
        try {
            await watcher.watch();
        }
        catch (e) {
            toolbox.print.error(String(e.message));
        }
    }
    _writeSubgraphFile(maybeRelativeFile, data, sourceDir, targetDir, spinner) {
        const absoluteSourceFile = path_1.default.resolve(sourceDir, maybeRelativeFile);
        const relativeSourceFile = path_1.default.relative(sourceDir, absoluteSourceFile);
        const targetFile = path_1.default.join(targetDir, relativeSourceFile);
        (0, spinner_1.step)(spinner, 'Write subgraph file', this.displayPath(targetFile));
        fs_extra_1.default.mkdirsSync(path_1.default.dirname(targetFile));
        fs_extra_1.default.writeFileSync(targetFile, data);
        return targetFile;
    }
    async compileSubgraph(subgraph) {
        return await (0, spinner_1.withSpinner)(`Compile subgraph`, `Failed to compile subgraph`, `Warnings while compiling subgraph`, async (spinner) => {
            // Cache compiled files so identical input files are only compiled once
            const compiledFiles = new Map();
            await asc.ready();
            subgraph = subgraph.update('dataSources', (dataSources) => dataSources.map((dataSource) => dataSource.updateIn(['mapping', 'file'], (mappingPath) => this._compileDataSourceMapping(this.protocol, dataSource, mappingPath, compiledFiles, spinner))));
            subgraph = subgraph.update('templates', (templates) => templates === undefined
                ? templates
                : templates.map((template) => template.updateIn(['mapping', 'file'], (mappingPath) => this._compileTemplateMapping(template, mappingPath, compiledFiles, spinner))));
            return subgraph;
        });
    }
    _compileDataSourceMapping(protocol, dataSource, mappingPath, compiledFiles, spinner) {
        if (protocol.name == 'substreams') {
            return;
        }
        try {
            const dataSourceName = dataSource.getIn(['name']);
            const baseDir = this.sourceDir;
            const absoluteMappingPath = path_1.default.resolve(baseDir, mappingPath);
            const inputFile = path_1.default.relative(baseDir, absoluteMappingPath);
            this._validateMappingContent(absoluteMappingPath);
            // If the file has already been compiled elsewhere, just use that output
            // file and return early
            const inputCacheKey = this.cacheKeyForFile(absoluteMappingPath);
            const alreadyCompiled = compiledFiles.has(inputCacheKey);
            if (alreadyCompiled) {
                const outFile = compiledFiles.get(inputCacheKey);
                (0, spinner_1.step)(spinner, 'Compile data source:', `${dataSourceName} => ${this.displayPath(outFile)} (already compiled)`);
                return outFile;
            }
            const outFile = path_1.default.resolve(this.subgraphDir(this.options.outputDir, dataSource), this.options.outputFormat == 'wasm' ? `${dataSourceName}.wasm` : `${dataSourceName}.wast`);
            (0, spinner_1.step)(spinner, 'Compile data source:', `${dataSourceName} => ${this.displayPath(outFile)}`);
            const outputFile = path_1.default.relative(baseDir, outFile);
            // Create output directory
            fs_extra_1.default.mkdirsSync(path_1.default.dirname(outFile));
            const libs = this.libsDirs.join(',');
            if (!this.globalsFile) {
                throw Error('Could not locate `@graphprotocol/graph-ts` package in parent directories of subgraph manifest.');
            }
            const global = path_1.default.relative(baseDir, this.globalsFile);
            asc.compile({
                inputFile,
                global,
                baseDir,
                libs,
                outputFile,
            });
            // Remember the output file to avoid compiling the same file again
            compiledFiles.set(inputCacheKey, outFile);
            return outFile;
        }
        catch (e) {
            throw Error(`Failed to compile data source mapping: ${e.message}`);
        }
    }
    _compileTemplateMapping(template, mappingPath, compiledFiles, spinner) {
        try {
            const templateName = template.get('name');
            const baseDir = this.sourceDir;
            const absoluteMappingPath = path_1.default.resolve(baseDir, mappingPath);
            const inputFile = path_1.default.relative(baseDir, absoluteMappingPath);
            this._validateMappingContent(absoluteMappingPath);
            // If the file has already been compiled elsewhere, just use that output
            // file and return early
            const inputCacheKey = this.cacheKeyForFile(absoluteMappingPath);
            const alreadyCompiled = compiledFiles.has(inputCacheKey);
            if (alreadyCompiled) {
                const outFile = compiledFiles.get(inputCacheKey);
                (0, spinner_1.step)(spinner, 'Compile data source template:', `${templateName} => ${this.displayPath(outFile)} (already compiled)`);
                return outFile;
            }
            const outFile = path_1.default.resolve(this.options.outputDir, 'templates', templateName, this.options.outputFormat == 'wasm' ? `${templateName}.wasm` : `${templateName}.wast`);
            (0, spinner_1.step)(spinner, 'Compile data source template:', `${templateName} => ${this.displayPath(outFile)}`);
            const outputFile = path_1.default.relative(baseDir, outFile);
            // Create output directory
            fs_extra_1.default.mkdirsSync(path_1.default.dirname(outFile));
            const libs = this.libsDirs.join(',');
            if (!this.globalsFile) {
                throw Error('Could not locate `@graphprotocol/graph-ts` package in parent directories of subgraph manifest.');
            }
            const global = path_1.default.relative(baseDir, this.globalsFile);
            asc.compile({
                inputFile,
                global,
                baseDir,
                libs,
                outputFile,
            });
            // Remember the output file to avoid compiling the same file again
            compiledFiles.set(inputCacheKey, outFile);
            return outFile;
        }
        catch (e) {
            throw Error(`Failed to compile data source template: ${e.message}`);
        }
    }
    _validateMappingContent(filePath) {
        const data = fs_extra_1.default.readFileSync(filePath);
        if (this.blockIpfsMethods && (data.includes('ipfs.cat') || data.includes('ipfs.map'))) {
            throw Error(`
      Subgraph Studio does not support mappings with ipfs methods.
      Please remove all instances of ipfs.cat and ipfs.map from
      ${filePath}
      `);
        }
    }
    async writeSubgraphToOutputDirectory(protocol, subgraph) {
        const displayDir = `${this.displayPath(this.options.outputDir)}${toolbox.filesystem.separator}`;
        return await (0, spinner_1.withSpinner)(`Write compiled subgraph to ${displayDir}`, `Failed to write compiled subgraph to ${displayDir}`, `Warnings while writing compiled subgraph to ${displayDir}`, async (spinner) => {
            // Copy schema and update its path
            subgraph = subgraph.updateIn(['schema', 'file'], schemaFile => {
                const schemaFilePath = path_1.default.resolve(this.sourceDir, schemaFile);
                const schemaFileName = path_1.default.basename(schemaFile);
                const targetFile = path_1.default.resolve(this.options.outputDir, schemaFileName);
                (0, spinner_1.step)(spinner, 'Copy schema file', this.displayPath(targetFile));
                fs_extra_1.default.copyFileSync(schemaFilePath, targetFile);
                return path_1.default.relative(this.options.outputDir, targetFile);
            });
            // Copy data source files and update their paths
            subgraph = subgraph.update('dataSources', (dataSources) => dataSources.map(dataSource => {
                let updatedDataSource = dataSource;
                if (this.protocol.hasABIs()) {
                    updatedDataSource = updatedDataSource
                        // Write data source ABIs to the output directory
                        .updateIn(['mapping', 'abis'], (abis) => abis.map((abi) => abi.update('file', (abiFile) => {
                        abiFile = path_1.default.resolve(this.sourceDir, abiFile);
                        const abiData = this.ABI.load(abi.get('name'), abiFile);
                        return path_1.default.relative(this.options.outputDir, this._writeSubgraphFile(abiFile, JSON.stringify(abiData.data.toJS(), null, 2), this.sourceDir, this.subgraphDir(this.options.outputDir, dataSource), spinner));
                    })));
                }
                if (protocol.name == 'substreams') {
                    updatedDataSource = updatedDataSource
                        // Write data source ABIs to the output directory
                        .updateIn(['source', 'package'], (substreamsPackage) => substreamsPackage.update('file', (packageFile) => {
                        packageFile = path_1.default.resolve(this.sourceDir, packageFile);
                        const packageContent = fs_extra_1.default.readFileSync(packageFile);
                        return path_1.default.relative(this.options.outputDir, this._writeSubgraphFile(packageFile, packageContent, this.sourceDir, this.subgraphDir(this.options.outputDir, dataSource), spinner));
                    }));
                    return updatedDataSource;
                }
                // The mapping file is already being written to the output
                // directory by the AssemblyScript compiler
                return updatedDataSource.updateIn(['mapping', 'file'], (mappingFile) => path_1.default.relative(this.options.outputDir, path_1.default.resolve(this.sourceDir, mappingFile)));
            }));
            // Copy template files and update their paths
            subgraph = subgraph.update('templates', templates => templates === undefined
                ? templates
                : templates.map((template) => {
                    let updatedTemplate = template;
                    if (this.protocol.hasABIs()) {
                        updatedTemplate = updatedTemplate
                            // Write template ABIs to the output directory
                            .updateIn(['mapping', 'abis'], (abis) => abis.map(abi => abi.update('file', (abiFile) => {
                            abiFile = path_1.default.resolve(this.sourceDir, abiFile);
                            const abiData = this.ABI.load(abi.get('name'), abiFile);
                            return path_1.default.relative(this.options.outputDir, this._writeSubgraphFile(abiFile, JSON.stringify(abiData.data.toJS(), null, 2), this.sourceDir, this.subgraphDir(this.options.outputDir, template), spinner));
                        })));
                    }
                    // The mapping file is already being written to the output
                    // directory by the AssemblyScript compiler
                    return updatedTemplate.updateIn(['mapping', 'file'], (mappingFile) => path_1.default.relative(this.options.outputDir, path_1.default.resolve(this.sourceDir, mappingFile)));
                }));
            // Write the subgraph manifest itself
            const outputFilename = path_1.default.join(this.options.outputDir, 'subgraph.yaml');
            (0, spinner_1.step)(spinner, 'Write subgraph manifest', this.displayPath(outputFilename));
            await subgraph_1.default.write(subgraph, outputFilename);
            return subgraph;
        });
    }
    async uploadSubgraphToIPFS(subgraph) {
        return (0, spinner_1.withSpinner)(`Upload subgraph to IPFS`, `Failed to upload subgraph to IPFS`, `Warnings while uploading subgraph to IPFS`, async (spinner) => {
            // Cache uploaded IPFS files so identical files are only uploaded once
            const uploadedFiles = new Map();
            // Collect all source (path -> hash) updates to apply them later
            const updates = [];
            // Upload the schema to IPFS
            updates.push({
                keyPath: ['schema', 'file'],
                value: await this._uploadFileToIPFS(subgraph.getIn(['schema', 'file']), uploadedFiles, spinner),
            });
            if (this.protocol.hasABIs()) {
                for (const [i, dataSource] of subgraph.get('dataSources').entries()) {
                    for (const [j, abi] of dataSource.getIn(['mapping', 'abis']).entries()) {
                        updates.push({
                            keyPath: ['dataSources', i, 'mapping', 'abis', j, 'file'],
                            value: await this._uploadFileToIPFS(abi.get('file'), uploadedFiles, spinner),
                        });
                    }
                }
            }
            // Upload all mappings
            if (this.protocol.name === 'substreams') {
                for (const [i, dataSource] of subgraph.get('dataSources').entries()) {
                    updates.push({
                        keyPath: ['dataSources', i, 'source', 'package', 'file'],
                        value: await this._uploadFileToIPFS(dataSource.getIn(['source', 'package', 'file']), uploadedFiles, spinner),
                    });
                }
            }
            else {
                for (const [i, dataSource] of subgraph.get('dataSources').entries()) {
                    updates.push({
                        keyPath: ['dataSources', i, 'mapping', 'file'],
                        value: await this._uploadFileToIPFS(dataSource.getIn(['mapping', 'file']), uploadedFiles, spinner),
                    });
                }
            }
            for (const [i, template] of subgraph.get('templates', immutable_1.default.List()).entries()) {
                if (this.protocol.hasABIs()) {
                    for (const [j, abi] of template.getIn(['mapping', 'abis']).entries()) {
                        updates.push({
                            keyPath: ['templates', i, 'mapping', 'abis', j, 'file'],
                            value: await this._uploadFileToIPFS(abi.get('file'), uploadedFiles, spinner),
                        });
                    }
                }
                updates.push({
                    keyPath: ['templates', i, 'mapping', 'file'],
                    value: await this._uploadFileToIPFS(template.getIn(['mapping', 'file']), uploadedFiles, spinner),
                });
            }
            // Apply all updates to the subgraph
            for (const update of updates) {
                subgraph = subgraph.setIn(update.keyPath, update.value);
            }
            // Upload the subgraph itself
            return await this._uploadSubgraphDefinitionToIPFS(subgraph);
        });
    }
    async _uploadFileToIPFS(maybeRelativeFile, uploadedFiles, spinner) {
        compilerDebug('Resolving IPFS file "%s" from output dir "%s"', maybeRelativeFile, this.options.outputDir);
        const absoluteFile = path_1.default.resolve(this.options.outputDir, maybeRelativeFile);
        (0, spinner_1.step)(spinner, 'Add file to IPFS', this.displayPath(absoluteFile));
        const uploadCacheKey = this.cacheKeyForFile(absoluteFile);
        const alreadyUploaded = uploadedFiles.has(uploadCacheKey);
        if (!alreadyUploaded) {
            // @ts-expect-error Buffer.from with Buffer data can indeed accept utf-8
            const content = Buffer.from(await fs_extra_1.default.readFile(absoluteFile), 'utf-8');
            const hash = await this._uploadToIPFS({
                path: path_1.default.relative(this.options.outputDir, absoluteFile),
                content,
            });
            uploadedFiles.set(uploadCacheKey, hash);
        }
        const hash = uploadedFiles.get(uploadCacheKey);
        (0, spinner_1.step)(spinner, '              ..', `${hash}${alreadyUploaded ? ' (already uploaded)' : ''}`);
        return immutable_1.default.fromJS({ '/': `/ipfs/${hash}` });
    }
    async _uploadSubgraphDefinitionToIPFS(subgraph) {
        const str = js_yaml_1.default.safeDump(subgraph.toJS(), { noRefs: true, sortKeys: true });
        const file = { path: 'subgraph.yaml', content: Buffer.from(str, 'utf-8') };
        return await this._uploadToIPFS(file);
    }
    async _uploadToIPFS(file) {
        try {
            const files = this.ipfs.addAll([file]);
            // We get back async iterable
            const filesIterator = files[Symbol.asyncIterator]();
            // We only care about the first item, since that is the file, rest could be directories
            const { value } = await filesIterator.next();
            // we grab the file and pin it
            const uploadedFile = value;
            await this.ipfs.pin.add(uploadedFile.cid);
            return uploadedFile.cid.toString();
        }
        catch (e) {
            throw Error(`Failed to upload file to IPFS: ${e.message}`);
        }
    }
}
exports.default = Compiler;

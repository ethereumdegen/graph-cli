"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@oclif/core");
const gluegun_1 = require("gluegun");
const auth_1 = require("../command-helpers/auth");
const node_1 = require("../command-helpers/node");
class AuthCommand extends core_1.Command {
    async run() {
        const { args: { node: nodeOrDeployKey, 'deploy-key': deployKeyFlag }, flags: { product, studio }, } = await this.parse(AuthCommand);
        // if user specifies --product or --studio then deployKey is the first parameter
        let node;
        let deployKey = deployKeyFlag;
        if (product || studio) {
            ({ node } = (0, node_1.chooseNodeUrl)({ product, studio, node }));
            deployKey = nodeOrDeployKey;
        }
        else {
            node = nodeOrDeployKey;
        }
        // eslint-disable-next-line -- prettier has problems with ||=
        node =
            node ||
                (await core_1.ux.prompt('Which product to initialize?', {
                    required: true,
                }));
        // eslint-disable-next-line -- prettier has problems with ||=
        deployKey =
            deployKey ||
                (await core_1.ux.prompt('What is the deploy key?', {
                    required: true,
                    type: 'mask',
                }));
        if (deployKey.length > 200) {
            this.error('✖ Deploy key must not exceed 200 characters', { exit: 1 });
        }
        try {
            await (0, auth_1.saveDeployKey)(node, deployKey);
            gluegun_1.print.success(`Deploy key set for ${node}`);
        }
        catch (e) {
            this.error(e, { exit: 1 });
        }
    }
}
AuthCommand.description = 'Sets the deploy key to use when deploying to a Graph node.';
AuthCommand.args = {
    node: core_1.Args.string(),
    'deploy-key': core_1.Args.string(),
};
AuthCommand.flags = {
    help: core_1.Flags.help({
        char: 'h',
    }),
    product: core_1.Flags.string({
        summary: 'Select a product for which to authenticate.',
        options: ['subgraph-studio', 'hosted-service'],
    }),
    studio: core_1.Flags.boolean({
        summary: 'Shortcut for "--product subgraph-studio".',
        exclusive: ['product'],
    }),
};
exports.default = AuthCommand;

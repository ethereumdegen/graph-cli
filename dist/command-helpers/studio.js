"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateStudioNetwork = exports.allowedStudioNetworks = void 0;
exports.allowedStudioNetworks = [
    'mainnet',
    'rinkeby',
    'goerli',
    'gnosis',
    'chapel',
    'optimism-goerli',
    'clover',
    'fantom-testnet',
    'arbitrum-goerli',
    'fuji',
    'celo-alfajores',
    'mumbai',
    'aurora-testnet',
    'near-testnet',
    'theta-testnet-001',
    'osmo-test-4',
    'base-testnet',
    'celo',
    'arbitrum-one',
    'avalanche',
    'zksync-era',
    'sepolia',
    'polygon-zkevm-testnet',
    'polygon-zkevm',
];
const validateStudioNetwork = ({ studio, product, network, }) => {
    const isStudio = studio || product === 'subgraph-studio';
    const isAllowedNetwork = !network ||
        exports.allowedStudioNetworks.includes(
        // @ts-expect-error we're checking if the network is allowed
        network);
    if (isStudio && !isAllowedNetwork) {
        throw new Error(`The Subgraph Studio only allows subgraphs for these networks: ${exports.allowedStudioNetworks.join(', ')}`);
    }
};
exports.validateStudioNetwork = validateStudioNetwork;

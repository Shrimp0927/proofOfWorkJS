const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
const uuid = require('uuid');
const port = process.argv[2];
const rp = require('request-promise');
const request = require('request');
const requestPromise = require('request-promise');

const nodeAddress = uuid.v1().split('-').join('');

const bitcoin = new Blockchain();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.get('/blockchain', (req, res) => {
    res.send(bitcoin);
})

app.post('/transaction', (req, res) => {
    const newTransaction = req.body;
    const blockIndex = bitcoin.addTransactionToPendingTransactions(newTransaction);
    res.json({ note: `Transaction in block ${blockIndex}` });
})

app.post('transaction/broadcast', (req, res) => {
    const newTransaction = bitcoin.createNewTransaction(req.body.amount, req.body.sender, req.body.recipient);
    bitcoin.addTransactionToPendingTransactions(newTransaction);

    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/transaction',
            method: 'POST',
            body: newTransaction,
            json: true,
        }
        
        requestPromises.push(rp(requestOptions));
    });

    Promise.all(requestPromises).then(data => {
        res.json({ note: "transaction broadcast success" });
    });

})

app.get('/mine', (req, res) => {
    const lastBlock = bitcoin.getLastBlock();
    const prevHash = lastBlock['hash'];
    const currentBlockData = {
        transactions: bitcoin.pendingTransaction,
        index: lastBlock['index'] + 1,
    };

    const nonce = bitcoin.proofOfWork(prevHash, currentBlockData);
    const blockHash = bitcoin.hashBlock(prevHash, currentBlockData, nonce);

    const newBlock = bitcoin.createNewBlock(nonce, prevHash, blockHash);

    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/receive-new-block',
            method: 'POST',
            body: { newBlock: newBlock },
            json: true,
        }

        requestPromise.push(rp(requestOptions));
    });

    Promise.all(requestPromises).then(data => {
        const requestOptions = {
            uri: bitcoin.currentNodeUrl + '/transaction/broadcast',
            method: 'POST',
            body: {
                amount: 5,
                sender: "00",
                recipient: nodeAddress,
            },
            json: true,
        }

        return rp(requestOptions);
    }).then(data => {
        res.json({ note: "new block mined", block: newBlock });
    })

    res.json({
        note: "New block mined",
        block: newBlock
    });
})

app.post('/receive-new-block', (req, res) => {
    const newBlock = req.body.newBlock;
    const lastBlock = bitcoin.getLastBlock();
    const correctHash = lastBlock.hash === newBlock.previousBlockHash;
    const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

    if (correctHash && correctIndex) {
        bitcoin.chain.push(newBlock);
        bitcoin.pendingTransaction = [];
        res.json({
            note: 'New block receive and accepted',
            newBlock: newBlock,
        })
    } else {
        res.json({ note: 'new block rejected', newBlock: newBlock, });
    }
})

app.post('/register-and-broadcast-node', (req, res) => {
    const newNodeUrl = req.body.newNodeUrl;
    if (bitcoin.networkNodes.indexOf(newNodeUrl) == -1) bitcoin.networkNodes.push(newNodeUrl);

    const regNodesPromises = [];
    bitcoin.networkNodes.forEach((networkNodeUrl) => {
        const requestOptions = {
            uri: networkNodeUrl + '/register-node',
            method: 'POST',
            body: { newNodeUrl: newNodeUrl },
            json: true,
        };

        regNodesPromises.push(rp(requestOptions));
    })

    Promise.all(regNodesPromise).then((data) => {
        const bulkRegisterOptions = {
            uri: newNodeUrl + '/register-nodes-bulk',
            method: 'POST',
            body: { allNetWorkNodes: [ ...bitcoin.networkNodes, bitcoin.currentNodeUrl ] },
            json: true,
        }

        return rp(bulkRegisterOptions);
    }).then((data) => {
        res.json({ note: "New node registered successfully" });
    })
});

app.post('/register-node', (req, res) => {
    const newNodeUrl = req.body.newNodeUrl;
    if (bitcoin.networkNodes.indexOf(newNodeUrl) == -1 && bitcoin.currentNodeUrl !== newNodeUrl) bitcoin.networkNodes.push(newNodeUrl);
    res.json({ note: "new node registered" });
});

app.post('/register-nodes-bulk', (req, res) => {
    const allNetWorkNodes = req.body.allNetWorkNodes;
    allNetWorkNodes.forEach((networkNodeUrl) => {
        if (bitcoin.networkNodes.indexOf(networkNodeUrl) == -1 && bitcoin.currentNodeUrl !== networkNodeUrl) bitcoin.networkNodes.push(networkNodeUrl);
    });

    res.json({ note: "bulk reg successful" });
});

app.get('/consensus', (req, res) => {
    const requestPromises = [];
    bitcoin.networkNodes.forEach(networkNodeUrl => {
        const requestOptions = {
            uri: networkNodeUrl + '/blockchain',
            method: 'GET',
            json: true,
        }

        requestPromises.push(rp(requestOptions));
    })

    Promise.all(requestPromises).then(blockchains => {
        const currentChainLength = bitcoin.chain.length;
        let maxChainLength = currentChainLength;
        let newLongestChain = null;
        let newPendingTransactions = null;

        blockchains.forEach(blockchain => {
            if (blockchain.chain.length > maxChainLength) {
                maxChainLength = blockchain.chain.length;
                newLongestChain = blockchain.chain;
                newPendingTransactions = blockchain.pendingTransactions;
            }
        })

        if (!newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain))) {
            res.json({ note: 'note replaced', chain: bitcoin.chain });
        } else {
            bitcoin.chain = newLongestChain;
            bitcoin.pendingTransactions = newPendingTransactions;
            res.json({ note: 'chain replaced', chain: bitcoin.chain });
        }
    })
})

app.get('/block/:blockHash', (req, res) => {
    const blockHash = req.params.blockHash;
    const correctBlock = bitcoin.getBlock(blockHash);
    res.json({ block: correctBlock });
})

app.get('/transaction/transactionId', (req, res) => {
    const transactionId = req.params.transactionId;
    const transactionData = bitcoin.getTransaction(transactionId);
    res.json({ transaction: transactionData.transaction, block: transactionData.block });
})

app.get('/address/:address', (req, res) => {
    const address = req.params.address;
    const addressData = bitcoin.getAddressData(address);
    res.json({ addressData: addressData });
})

app.listen(port);
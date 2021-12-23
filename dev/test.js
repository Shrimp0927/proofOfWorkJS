const Blockchain = require('./blockchain');

const bitcoin = new Blockchain();

bitcoin.createNewBlock(123, 'asld;fjlasdf', 'alsdjkfls');
bitcoin.createNewBlock(124323, 'aslasdf', 'alsfls');
bitcoin.createNewBlock(1543543, 'alf', 'alskfs');

console.log(bitcoin);
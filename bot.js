const TronWeb = require("tronweb");
const fs = require("fs");
const bip39 = require("bip39");
const hdkey = require("hdkey");
const readline = require("readline");

//////////////////////////////////////////////////////
// RPC LIST (NO API KEY)
//////////////////////////////////////////////////////

const RPC_LIST = [
 "https://tron.api.pocket.network",
 "https://tron-rpc.publicnode.com",
 "https://rpc.ankr.com/tron",
 "https://tron-mainnet.public.blastapi.io"
];

let currentRPC = 0;

let tronWeb = new TronWeb({
 fullHost: RPC_LIST[currentRPC]
});

function switchRPC() {

 currentRPC++;

 if (currentRPC >= RPC_LIST.length) {
  currentRPC = 0;
 }

 console.log("Switch RPC ->", RPC_LIST[currentRPC]);

 tronWeb = new TronWeb({
  fullHost: RPC_LIST[currentRPC]
 });

}

//////////////////////////////////////////////////////
// CLI
//////////////////////////////////////////////////////

const rl = readline.createInterface({
 input: process.stdin,
 output: process.stdout
});

function ask(q) {
 return new Promise(resolve => rl.question(q, resolve));
}

function sleep(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
}

//////////////////////////////////////////////////////
// GENERATE WALLET
//////////////////////////////////////////////////////

function generateAccountsFromMnemonic(mnemonic, count = 10) {

 const seed = bip39.mnemonicToSeedSync(mnemonic);

 const root = hdkey.fromMasterSeed(seed);

 const privateKeys = [];

 for (let i = 0; i < count; i++) {

  const child = root.derive(`m/44'/195'/0'/0/${i}`);

  privateKeys.push(child.privateKey.toString("hex"));

 }

 return privateKeys;

}

//////////////////////////////////////////////////////
// BALANCE
//////////////////////////////////////////////////////

async function getBalance(address) {

 try {

  await sleep(500);

  return await tronWeb.trx.getBalance(address);

 } catch (err) {

  console.log("RPC error, mencoba node lain...");

  switchRPC();

  await sleep(2000);

  return await tronWeb.trx.getBalance(address);

 }

}

//////////////////////////////////////////////////////
// BANDWIDTH
//////////////////////////////////////////////////////

async function getBandwidth(address) {

 try {

  const res = await tronWeb.trx.getAccountResources(address);

  return res.freeNetLimit - res.freeNetUsed;

 } catch {

  return 0;

 }

}

//////////////////////////////////////////////////////
// SEND
//////////////////////////////////////////////////////

async function sendTransaction(privateKey, toAddress) {

 try {

  const address = tronWeb.address.fromPrivateKey(privateKey);

  const balance = await getBalance(address);

  const bandwidth = await getBandwidth(address);

  console.log(`Saldo ${address}: ${balance / 1e6} TRX`);
  console.log(`Bandwidth: ${bandwidth}`);

  if (balance === 0) {

   console.log("Saldo kosong\n");
   return;

  }

  const fee = 1000000;
  const amount = balance - fee;

  if (amount <= 0) {

   console.log("Saldo tidak cukup untuk fee\n");
   return;

  }

  const txn = await tronWeb.transactionBuilder.sendTrx(
   toAddress,
   amount,
   address
  );

  const signed = await tronWeb.trx.sign(txn, privateKey);

  const result = await tronWeb.trx.sendRawTransaction(signed);

  console.log(result);

  if (result.result) {

   console.log("✅ Berhasil");
   console.log("TXID:", result.txid);

  }

 } catch (err) {

  console.log("Error transaksi");

  console.log(err);

  switchRPC();

 }

}

//////////////////////////////////////////////////////
// MAIN
//////////////////////////////////////////////////////

async function main() {

 console.log("\n=== TRON Sweeper (No API Key) ===\n");

 const phrase = await ask("Paste seed phrase: ");

 if (!bip39.validateMnemonic(phrase)) {

  console.log("Seed phrase tidak valid");

  process.exit();

 }

 const count = parseInt(await ask("Jumlah wallet: "), 10);

 const privateKeys = generateAccountsFromMnemonic(phrase, count);

 fs.writeFileSync("accounts.txt", privateKeys.join("\n"));

 const addresses = privateKeys.map(pk =>
  tronWeb.address.fromPrivateKey(pk)
 );

 fs.writeFileSync("address.txt", addresses.join("\n"));

 const toAddress = await ask("Address penerima: ");

 console.log("\nMulai sweeping...\n");

 for (let i = 0; i < privateKeys.length; i++) {

  console.log("Akun", i + 1);

  await sendTransaction(privateKeys[i], toAddress);

  await sleep(7000);

 }

 rl.close();

}

main();

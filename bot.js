const TronWeb = require("tronweb");
const fs = require("fs");
const bip39 = require("bip39");
const hdkey = require("hdkey");
const dotenv = require("dotenv");
const readline = require("readline");

dotenv.config();

//////////////////////////////////////////////////////
// RPC LIST
//////////////////////////////////////////////////////

const RPC_LIST = [
  process.env.RPC_URL || "https://tron.api.pocket.network",
  "https://api.trongrid.io",
  "https://tron-rpc.publicnode.com"
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
// CLI INPUT
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
// SAVE WALLET
//////////////////////////////////////////////////////

function saveAddresses(privateKeys) {

  fs.writeFileSync("accounts.txt", privateKeys.join("\n"));

  const addresses = privateKeys.map(pk =>
    tronWeb.address.fromPrivateKey(pk)
  );

  fs.writeFileSync("address.txt", addresses.join("\n"));

}

//////////////////////////////////////////////////////
// GET BALANCE
//////////////////////////////////////////////////////

async function getBalance(address) {

  try {

    return await tronWeb.trx.getBalance(address);

  } catch (err) {

    console.log("RPC error, mencoba node lain...");

    switchRPC();

    return await tronWeb.trx.getBalance(address);

  }

}

//////////////////////////////////////////////////////
// SEND TRANSACTION
//////////////////////////////////////////////////////

async function sendTransaction(privateKey, toAddress) {

  try {

    const address = tronWeb.address.fromPrivateKey(privateKey);

    const balance = await getBalance(address);

    const trxBalance = balance / 1e6;

    console.log(`Saldo ${address}: ${trxBalance} TRX`);

    if (balance === 0) {

      console.log("Saldo kosong, skip\n");
      return;

    }

    const estimatedFee = 100000; // 0.1 TRX

    let amount = balance - estimatedFee;

    if (amount <= 0) {

      console.log("Saldo terlalu kecil untuk fee\n");
      return;

    }

    const txn = await tronWeb.transactionBuilder.sendTrx(
      toAddress,
      amount,
      address
    );

    const signed = await tronWeb.trx.sign(txn, privateKey);

    const result = await tronWeb.trx.sendRawTransaction(signed);

    if (result.result) {

      console.log("✅ Berhasil kirim");
      console.log("TXID:", result.txid);

    } else {

      console.log("❌ Transaksi gagal:", result);

    }

    console.log("");

  } catch (err) {

    console.log("Error transaksi:", err.message);

    switchRPC();

  }

}

//////////////////////////////////////////////////////
// MAIN
//////////////////////////////////////////////////////

async function main() {

  console.log("\n=== TRON Wallet Generator & Sweeper ===\n");

  const phrase = await ask("Paste seed phrase: ");

  if (!bip39.validateMnemonic(phrase)) {

    console.log("Seed phrase tidak valid");
    process.exit();

  }

  const count = parseInt(
    await ask("Jumlah wallet yang digenerate: "),
    10
  );

  if (isNaN(count) || count <= 0) {

    console.log("Jumlah wallet tidak valid");
    process.exit();

  }

  const privateKeys = generateAccountsFromMnemonic(phrase, count);

  console.log(`\nBerhasil generate ${privateKeys.length} wallet`);

  saveAddresses(privateKeys);

  console.log("Private key -> accounts.txt");
  console.log("Address -> address.txt");

  const toAddress = await ask("\nMasukkan address penerima: ");

  if (!tronWeb.isAddress(toAddress)) {

    console.log("Address tidak valid");
    process.exit();

  }

  console.log("\nMulai kirim saldo...\n");

  for (let i = 0; i < privateKeys.length; i++) {

    console.log(`Akun ${i + 1}`);

    await sendTransaction(privateKeys[i], toAddress);

    await sleep(3000);

  }

  rl.close();

}

main();

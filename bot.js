const TronWeb = require("tronweb");
const fs = require("fs");
const bip39 = require("bip39");
const hdkey = require("hdkey");
const dotenv = require("dotenv");
const readline = require("readline");

dotenv.config();

const RPC_URL = process.env.RPC_URL;
if (!RPC_URL) {
  console.log("RPC_URL tidak ditemukan di .env");
  process.exit();
}

const tronWeb = new TronWeb({
  fullHost: RPC_URL
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

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

function saveAddresses(privateKeys) {
  fs.writeFileSync("accounts.txt", privateKeys.join("\n"));
  const addresses = privateKeys.map(pk => tronWeb.privateKeyToAccount(pk).address.base58);
  fs.writeFileSync("address.txt", addresses.join("\n"));
}

async function sendTransaction(privateKey, toAddress) {
  try {
    const account = tronWeb.privateKeyToAccount(privateKey);
    const balance = await tronWeb.trx.getBalance(account.address);

    console.log(`Saldo ${account.address}: ${balance / 1e6} TRX`);

    if (balance <= 1e6) {
      console.log("Saldo tidak cukup untuk fee");
      return;
    }

    const amount = balance - 1e6;

    const txn = await tronWeb.transactionBuilder.sendTrx(toAddress, amount, account.address);
    const signed = await tronWeb.trx.sign(txn, privateKey);
    const result = await tronWeb.trx.sendRawTransaction(signed);

    console.log("TXID:", result.txid);
  } catch (err) {
    console.log("Error:", err.message);
  }
}

async function main() {
  console.log("\n=== TRON Wallet Generator & Sweeper ===\n");

  const phrase = await ask("Paste seed phrase disini: ");
  if (!bip39.validateMnemonic(phrase)) {
    console.log("Seed phrase tidak valid");
    process.exit();
  }

  const count = parseInt(await ask("Jumlah wallet yang digenerate (contoh 10): "), 10);
  const privateKeys = generateAccountsFromMnemonic(phrase, count);

  console.log(`\nBerhasil generate ${privateKeys.length} wallet`);
  saveAddresses(privateKeys);

  console.log("Private key -> accounts.txt");
  console.log("Address -> address.txt");

  const toAddress = await ask("\nMasukkan address penerima: ");
  if (!tronWeb.isAddress(toAddress)) {
    console.log("Address tidak valid.");
    process.exit();
  }

  console.log("\nMulai kirim saldo...\n");
  for (let i = 0; i < privateKeys.length; i++) {
    console.log(`Akun ${i + 1}`);
    await sendTransaction(privateKeys[i], toAddress);
  }

  rl.close();
}

main();

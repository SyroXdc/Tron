```javascript
const TronWeb = require("tronweb");
const fs = require("fs");
const bip39 = require("bip39");
const hdkey = require("hdkey");
const readline = require("readline");

//////////////////////////////////////////////////////
// RPC LIST
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
  if (currentRPC >= RPC_LIST.length) currentRPC = 0;

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
// SAVE ADDRESS
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

    await sleep(500);

    const balance = await tronWeb.trx.getBalance(address);

    return balance;

  } catch (err) {

    console.log("RPC error, mencoba node lain...");

    switchRPC();

    await sleep(2000);

    return await tronWeb.trx.getBalance(address);
  }
}

//////////////////////////////////////////////////////
// GET BANDWIDTH
//////////////////////////////////////////////////////

async function getBandwidth(address) {
  try {

    const res = await tronWeb.trx.getAccountResources(address);

    if (!res) return 0;

    const limit = res.freeNetLimit || 0;
    const used = res.freeNetUsed || 0;

    return limit - used;

  } catch {

    return 0;
  }
}

//////////////////////////////////////////////////////
// SEND TRANSACTION
//////////////////////////////////////////////////////

async function sendTransaction(privateKey, toAddress, retry = 0) {

  const MAX_RETRY = 3;

  try {

    const address = tronWeb.address.fromPrivateKey(privateKey);

    const balance = await getBalance(address);
    const bandwidth = await getBandwidth(address);

    console.log(`Saldo ${address}: ${(balance / 1e6).toFixed(6)} TRX`);
    console.log(`Bandwidth: ${bandwidth}`);

    if (balance === 0) {
      console.log("Saldo kosong, skip\n");
      return;
    }

    const reserve = 1_000_000;
    const amount = balance - reserve;

    if (amount <= 0) {
      console.log("Saldo terlalu kecil\n");
      return;
    }

    if (bandwidth < 100) {
      console.log("Bandwidth rendah, skip sementara\n");
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
      console.log("TXID:", result.txid, "\n");

    } else {

      console.log("❌ Transaksi gagal:", result);
    }

  } catch (err) {

    console.log("Error transaksi:", err.message || err);

    if (retry < MAX_RETRY) {

      console.log("Retry transaksi...");

      switchRPC();

      await sleep(5000);

      await sendTransaction(privateKey, toAddress, retry + 1);

    } else {

      console.log("Gagal setelah beberapa retry\n");
    }
  }
}

//////////////////////////////////////////////////////
// MAIN
//////////////////////////////////////////////////////

async function main() {

  console.log("\n=== TRON Wallet Sweeper ===\n");

  const phrase = await ask("Paste seed phrase: ");

  if (!bip39.validateMnemonic(phrase)) {

    console.log("Seed phrase tidak valid");

    process.exit();
  }

  const count = parseInt(await ask("Jumlah wallet yang digenerate: "), 10);

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

  console.log("\nMulai sweeping...\n");

  for (let i = 0; i < privateKeys.length; i++) {

    console.log(`Akun ${i + 1}`);

    await sendTransaction(privateKeys[i], toAddress);

    await sleep(7000);
  }

  rl.close();
}

main();
```

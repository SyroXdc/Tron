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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

//////////////////////////////////////////////////////
// Generate private keys dari mnemonic
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
// Simpan wallet ke file
//////////////////////////////////////////////////////

function saveAddresses(privateKeys) {

  fs.writeFileSync("accounts.txt", privateKeys.join("\n"));

  const addresses = privateKeys.map(pk =>
    tronWeb.address.fromPrivateKey(pk)
  );

  fs.writeFileSync("address.txt", addresses.join("\n"));
}

//////////////////////////////////////////////////////
// Kirim TRX
//////////////////////////////////////////////////////

async function sendTransaction(privateKey, toAddress) {

  try {

    const address = tronWeb.address.fromPrivateKey(privateKey);

    const balance = await tronWeb.trx.getBalance(address);

    console.log(`Saldo ${address}: ${balance / 1e6} TRX`);

    if (balance === 0) {

      console.log("Saldo kosong, skip\n");

      return;
    }

    // sisakan sedikit TRX untuk fee (0.05 TRX)
    const feeReserve = 5e4;

    let amount = balance - feeReserve;

    if (amount <= 0) {

      console.log("Saldo sangat kecil, kirim semua saldo");

      amount = balance;
    }

    const txn = await tronWeb.transactionBuilder.sendTrx(
      toAddress,
      amount,
      address
    );

    const signed = await tronWeb.trx.sign(txn, privateKey);

    const result = await tronWeb.trx.sendRawTransaction(signed);

    if (result.result) {

      console.log("Berhasil kirim!");
      console.log("TXID:", result.txid);

    } else {

      console.log("Transaksi gagal:", result);

    }

    console.log("");

  } catch (err) {

    console.log("Error:", err.message, "\n");

  }
}

//////////////////////////////////////////////////////
// MAIN
//////////////////////////////////////////////////////

async function main() {

  console.log("\n=== TRON Wallet Generator & Sweeper ===\n");

  const phrase = await ask("Paste seed phrase disini: ");

  if (!bip39.validateMnemonic(phrase)) {

    console.log("Seed phrase tidak valid");

    process.exit();
  }

  const count = parseInt(
    await ask("Jumlah wallet yang digenerate (contoh 10): "),
    10
  );

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

    await sleep(2000); // delay 2 detik
  }

  rl.close();
}

main();

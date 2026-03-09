from tronpy import Tron
from tronpy.providers import HTTPProvider
from tronpy.keys import PrivateKey
from mnemonic import Mnemonic
from bip_utils import Bip39SeedGenerator, Bip44, Bip44Coins, Bip44Changes
from dotenv import load_dotenv
import os

# Load env
load_dotenv()

RPC_URL = os.getenv("RPC_URL")

if not RPC_URL:
    print("RPC_URL tidak ditemukan di file .env")
    exit()

# Koneksi Tron
tron = Tron(HTTPProvider(RPC_URL))

try:
    tron.get_latest_block()
except:
    print("Gagal terhubung ke jaringan Tron")
    exit()

# =========================
# Generate accounts dari mnemonic
# =========================

def generate_accounts_from_mnemonic(mnemonic_phrase, num_accounts=10):

    seed_bytes = Bip39SeedGenerator(mnemonic_phrase).Generate()

    bip44_mst = Bip44.FromSeed(seed_bytes, Bip44Coins.TRON)

    private_keys = []

    for i in range(num_accounts):

        account = (
            bip44_mst
            .Purpose()
            .Coin()
            .Account(0)
            .Change(Bip44Changes.CHAIN_EXT)
            .AddressIndex(i)
        )

        private_key = account.PrivateKey().Raw().ToHex()

        private_keys.append(private_key)

    return private_keys


# =========================
# Simpan address & private key
# =========================

def save_addresses_and_keys(private_keys):

    with open("accounts.txt", "w") as f:
        for pk in private_keys:
            f.write(pk + "\n")

    with open("address.txt", "w") as f:
        for pk in private_keys:
            key = PrivateKey(bytes.fromhex(pk))
            address = key.public_key.to_base58check_address()
            f.write(address + "\n")


# =========================
# Kirim semua TRX
# =========================

def send_transaction(private_key, to_address):

    try:

        key = PrivateKey(bytes.fromhex(private_key))
        from_address = key.public_key.to_base58check_address()

        balance = tron.get_account_balance(from_address)

        print(f"Saldo {from_address} : {balance} TRX")

        if balance <= 1:
            print("Saldo tidak cukup untuk fee")
            return

        amount = int((balance - 1) * 1_000_000)

        txn = (
            tron.trx.transfer(from_address, to_address, amount)
            .build()
            .sign(key)
            .broadcast()
        )

        print("TXID:", txn["txid"])

    except Exception as e:
        print("Error:", e)


# =========================
# MAIN
# =========================

def main():

    print("\nPaste seed phrase anda\n")

    mnemonic_phrase = input("Seed Phrase: ").strip()

    mnemonic_obj = Mnemonic("english")

    if not mnemonic_obj.check(mnemonic_phrase):
        print("Seed phrase tidak valid")
        return

    num = int(input("Jumlah wallet yang digenerate (contoh 10): "))

    private_keys = generate_accounts_from_mnemonic(mnemonic_phrase, num)

    print(f"Berhasil generate {len(private_keys)} wallet")

    save_addresses_and_keys(private_keys)

    print("Private key -> accounts.txt")
    print("Address -> address.txt")

    to_address = input("\nMasukkan address penerima: ").strip()

    if not tron.is_address(to_address):
        print("Address tidak valid")
        return

    print("\nMulai mengirim saldo...\n")

    for i, pk in enumerate(private_keys):

        print(f"Akun {i+1}")
        send_transaction(pk, to_address)


if __name__ == "__main__":
    main()
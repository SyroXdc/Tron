from tronpy import Tron
from tronpy.providers import HTTPProvider
from tronpy.keys import PrivateKey
from dotenv import load_dotenv
import os

# Load env
load_dotenv()

# Ambil RPC
RPC_URL = os.getenv("RPC_URL")

if not RPC_URL:
    print("RPC_URL tidak ditemukan di file .env")
    exit(1)

# Koneksi ke Tron
tron = Tron(HTTPProvider(RPC_URL))

# Test koneksi
try:
    tron.get_latest_block()
except Exception as e:
    print("Gagal terhubung ke jaringan Tron")
    exit(1)


# =============================
# Membaca private key
# =============================
def read_private_keys():
    try:
        with open("accounts.txt", "r") as f:
            return [line.strip() for line in f.readlines()]
    except FileNotFoundError:
        print("File accounts.txt tidak ditemukan")
        return []


# =============================
# Kirim TRX
# =============================
def send_transaction(private_key_hex, to_address):

    try:

        private_key = PrivateKey(bytes.fromhex(private_key_hex))
        from_address = private_key.public_key.to_base58check_address()

        # cek saldo
        balance = tron.get_account_balance(from_address)

        print(f"Saldo {from_address}: {balance} TRX")

        if balance <= 1:
            print("Saldo tidak cukup untuk fee")
            return

        # kirim semua saldo - 1 TRX fee
        amount = int((balance - 1) * 1_000_000)

        txn = (
            tron.trx.transfer(from_address, to_address, amount)
            .build()
            .sign(private_key)
            .broadcast()
        )

        print("Transaksi berhasil")
        print("TXID:", txn["txid"])

    except Exception as e:
        print("Error:", str(e))


# =============================
# MAIN
# =============================
def main():

    to_address = input("Masukkan alamat penerima: ").strip()

    if not tron.is_address(to_address):
        print("Alamat penerima tidak valid")
        return

    private_keys = read_private_keys()

    if not private_keys:
        return

    print(f"Membaca {len(private_keys)} private key dari accounts.txt")

    for i, pk in enumerate(private_keys):

        print(f"\nMengirim dari akun {i+1}")
        send_transaction(pk, to_address)


if __name__ == "__main__":
    main()
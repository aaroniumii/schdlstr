# lnd_client.py (versión con grpc-lnd)
import os
from grpc_lnd import LNDClient
from dotenv import load_dotenv

load_dotenv()

# Variables de entorno necesarias
LND_GRPC_HOST = os.getenv("LND_GRPC_HOST", "127.0.0.1:10009")
TLS_CERT_PATH = os.getenv("LND_TLS_CERT", "/ruta/completa/tls.cert")
MACAROON_PATH = os.getenv("LND_MACAROON", "/ruta/completa/admin.macaroon")

# Inicializar cliente LND
lnd = LNDClient(
    grpc_host=LND_GRPC_HOST,
    cert_filepath=TLS_CERT_PATH,
    macaroon_filepath=MACAROON_PATH
)

def create_invoice(memo: str, amount_sats: int) -> dict:
    """Crea una factura de Lightning Network"""
    invoice = lnd.add_invoice(value=amount_sats, memo=memo)
    return {
        "payment_request": invoice.payment_request,
        "r_hash": invoice.r_hash.hex()
    }

def check_invoice_paid(r_hash_hex: str) -> bool:
    """Verifica si una factura ha sido pagada usando su r_hash en hexadecimal"""
    response = lnd.lookup_invoice(r_hash_str=r_hash_hex)
    return response.settled

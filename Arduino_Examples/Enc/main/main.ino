#include <Arduino.h>
#include <mbedtls/base64.h>
#include <mbedtls/ecp.h>
#include <mbedtls/bignum.h>

// Helper: decompress a 33-byte P-256 compressed point → 65-byte uncompressed
// Helper: decompress a 33-byte P-256 compressed public key → 65-byte uncompressed
bool decompressPublicKey(const uint8_t* comp, size_t compLen,
                         uint8_t* uncmp, size_t& uncmpLen)
{
  if (compLen != 33) return false;

  mbedtls_ecp_group grp;
  mbedtls_ecp_point pt;
  mbedtls_mpi X, Y2, Y, exp;
  int ret;
  bool success = false;

  mbedtls_ecp_group_init(&grp);
  mbedtls_ecp_point_init(&pt);
  mbedtls_mpi_init(&X);
  mbedtls_mpi_init(&Y2);
  mbedtls_mpi_init(&Y);
  mbedtls_mpi_init(&exp);

  do {
    // 1) load the P-256 curve
    ret = mbedtls_ecp_group_load(&grp, MBEDTLS_ECP_DP_SECP256R1);
    if (ret != 0) break;

    // 2) X = comp[1..32]
    ret = mbedtls_mpi_read_binary(&X, comp + 1, 32);
    if (ret != 0) break;

    // 3) compute Y2 = X^3 + A·X + B  (mod p)
    //    first Y2 = X^2 mod p
    ret = mbedtls_mpi_mul_mpi(&Y2, &X, &X) ||
          mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P) ||
          // Y2 = Y2 * X mod p → X^3
          mbedtls_mpi_mul_mpi(&Y2, &Y2, &X) ||
          mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P);
    if (ret != 0) break;

    //    add A·X (here A = -3)
    {
      mbedtls_mpi tmp;
      mbedtls_mpi_init(&tmp);
      mbedtls_mpi_mul_mpi(&tmp, &grp.A, &X);
      mbedtls_mpi_mod_mpi(&tmp, &tmp, &grp.P);
      mbedtls_mpi_add_mpi(&Y2, &Y2, &tmp);
      mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P);
      mbedtls_mpi_free(&tmp);
    }
    //    add B
    ret = mbedtls_mpi_add_mpi(&Y2, &Y2, &grp.B) ||
          mbedtls_mpi_mod_mpi(&Y2, &Y2, &grp.P);
    if (ret != 0) break;

    // 4) exp = (p + 1) / 4
    mbedtls_mpi_add_int(&exp, &grp.P, 1);
    mbedtls_mpi_shift_r(&exp, 2);

    // 5) Y = Y2^exp mod p
    ret = mbedtls_mpi_exp_mod(&Y, &Y2, &exp, &grp.P, NULL);
    if (ret != 0) break;

    // 6) if parity mismatches byte 0x02/0x03, Y = p - Y
    bool yOdd    = mbedtls_mpi_get_bit(&Y, 0);
    bool wantOdd = (comp[0] == 0x03);
    if (yOdd != wantOdd) {
      mbedtls_mpi_sub_mpi(&Y, &grp.P, &Y);
    }

    // 7) write the point (X,Y) as uncompressed (0x04||X||Y)
    mbedtls_mpi_lset(&pt.Z, 1);
    mbedtls_mpi_copy(&pt.X, &X);
    mbedtls_mpi_copy(&pt.Y, &Y);
    uncmpLen = 65;
    ret = mbedtls_ecp_point_write_binary(
      &grp, &pt,
      MBEDTLS_ECP_PF_UNCOMPRESSED,
      &uncmpLen,
      uncmp, 65
    );
    if (ret != 0) break;

    success = true;
  } while (0);

  // cleanup all mbedTLS objects
  mbedtls_ecp_point_free(&pt);
  mbedtls_ecp_group_free(&grp);
  mbedtls_mpi_free(&X);
  mbedtls_mpi_free(&Y2);
  mbedtls_mpi_free(&Y);
  mbedtls_mpi_free(&exp);

  return success;
}


void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  const char* b64 = "AgsPx8agMIJDCbu+2z3GClvqm7UBClPV/0sdJpx6ev6U";
  Serial.println("Decoding Base64...");
  uint8_t comp[33];
  size_t compLen = 0;
  if (mbedtls_base64_decode(comp, sizeof(comp), &compLen,
           (const unsigned char*)b64, strlen(b64)) != 0) {
    Serial.println(" Base64 decode error");
    return;
  }

  Serial.printf(" compressed len=%u, first byte=0x%02X\n",
                (unsigned)compLen, comp[0]);

  Serial.println(" Decompressing...");
  uint8_t uncmp[65];
  size_t uncmpLen = 0;
  if (!decompressPublicKey(comp, compLen, uncmp, uncmpLen)) {
    Serial.println(" ➜ FAILED to decompress!");
    return;
  }

  Serial.printf(" ➜ SUCCESS, uncompressed len=%u\n", (unsigned)uncmpLen);
  for (size_t i = 0; i < uncmpLen; i++) {
    Serial.printf("%02X", uncmp[i]);
    if ((i + 1) % 16 == 0) Serial.println();
    else Serial.print(" ");
  }
  Serial.println("\nDone.");
}

void loop() {
  // nothing
}

// tinf_gzip.c – gzip‐wrapper for tiny‐inflate
#include "tinf.h"
#include <stddef.h>

/* read little‐endian 32‐bit */
static unsigned long read_le32(const unsigned char *p) {
    return (unsigned long)p[0]
         | ((unsigned long)p[1] << 8)
         | ((unsigned long)p[2] << 16)
         | ((unsigned long)p[3] << 24);
}

/*
 * Decompress a gzip stream in memory:
 *   dest:      output buffer
 *   destLen:   in/out: its size / actual output size
 *   source:    input gzip data
 *   sourceLen: size of input
 *
 * Returns TINF_OK on success, or a negative error code.
 */
int TINFCC tinf_gzip_uncompress(void *dest, unsigned int *destLen,
                                const void *source, unsigned int sourceLen)
{
    const unsigned char *in = (const unsigned char*)source;
    unsigned int inLen = sourceLen;

    /* minimal gzip header: ID1, ID2, CM, FLG, MTIME(4), XFL, OS */
    if (inLen < 10
     || in[0] != 0x1F || in[1] != 0x8B || in[2] != 8) {
        return TINF_DATA_ERROR;
    }
    unsigned char flg = in[3];
    in    += 10; inLen -= 10;

    /* skip extra fields */
    if (flg & 0x04) {
        if (inLen < 2) return TINF_DATA_ERROR;
        unsigned int xlen = in[0] | (in[1] << 8);
        if (inLen < 2 + xlen) return TINF_DATA_ERROR;
        in    += 2 + xlen; inLen -= 2 + xlen;
    }
    /* skip original filename */
    if (flg & 0x08) {
        while (inLen && *in) { in++; inLen--; }
        if (!inLen) return TINF_DATA_ERROR;
        in++; inLen--;
    }
    /* skip comment */
    if (flg & 0x10) {
        while (inLen && *in) { in++; inLen--; }
        if (!inLen) return TINF_DATA_ERROR;
        in++; inLen--;
    }
    /* skip header CRC */
    if (flg & 0x02) {
        if (inLen < 2) return TINF_DATA_ERROR;
        in    += 2; inLen -= 2;
    }

    /* footer is CRC32 (4 bytes) + ISIZE (4 bytes) */
    if (inLen < 8) return TINF_DATA_ERROR;
    unsigned int deflateSize = inLen - 8;

    /* now call the raw inflate on the deflate payload */
    return tinf_uncompress(dest, destLen, in, deflateSize);
}

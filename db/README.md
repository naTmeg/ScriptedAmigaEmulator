# db/

Files the front-end (`index.htm`/`index.js`) fetches at runtime, relative to `index.htm`.

- `aros-amiga-m68k-rom.bin`, `aros-amiga-m68k-ext.bin`: the AROS Kickstart replacement
  (AROS m68k, SVN55696, 512 KB each). Used whenever no original Kickstart is selected.
  CRC32 `3F4FCC0A` / `F2E52B07`, see `AROS_ROM_CRC`/`AROS_EXT_CRC` in `index.js` and the
  AROS entries in `sae/roms.js`. Licensed under the AROS Public License,
  https://aros.sourceforge.io/license.html
- `games/`, `demos/`, `demos_aga/`, `tools/`: the disk-image database of scriptedamigaemulator.net.
  Not part of this repository. `index.js` asks the server for the first image of each group
  (HEAD request) and shows "(no disk images on this server)" in groups that are missing;
  the advanced mode (`Config`) works with your own images.

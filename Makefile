scriptedamigaemulator.js: sae/prototypes.js sae/utils.js sae/dms.js sae/config.js sae/roms.js sae/memory.js sae/autoconf.js sae/expansion.js sae/events.js sae/gayle.js sae/ide.js sae/filesys.js sae/hardfile.js sae/input.js sae/serial.js sae/custom.js sae/blitter.js sae/copper.js sae/playfield.js sae/video.js sae/audio.js sae/cia.js sae/disk.js sae/rtc.js sae/m68k.js sae/cpu.js sae/amiga.js
	closure-compiler --language_in=ECMASCRIPT6 --language_out ES5 $^ --js_output_file $@ --create_source_map $@.map
	printf "/*\n//@ sourceMappingURL=%b\n*/" $@.map >> $@

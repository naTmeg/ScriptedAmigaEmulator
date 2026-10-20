Scripted Amiga Emulator
=======================

Amiga Emulator in javascript and HTML5.

Visit https://scriptedamigaemulator.net
Development
-----------

The emulator runs straight from the source files (`index.htm`), no build step is needed.
The development tools need Node.js 20 or later:

    npm install
    npm run lint             # ESLint, fails on new findings only
    npm run test:cpu         # 68000 single-step tests in Node
    npm run fetch:vamigats   # once: vAmigaTS test disks for the browser tests
    npm run test:browser     # vAmigaTS screenshot tests in headless Chromium

See [tests/README.md](tests/README.md) for details.

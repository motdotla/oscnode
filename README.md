# oscnode

<img src="https://raw.githubusercontent.com/motdotla/oscnode/master/oscnode.png" alt="OSC Logo" align="right" />

OSC is an economic citizenship experiment aiming to increase economic participation in open source software.

This repository powers the native desktop node.

## Development

IMPORTANT: Make sure you are on npm 3. `npm install -g npm@3`. Otherwise, builds might not complete.

```bash
yarn start
```

## Builds

```bash
yarn dist
```

## Releases

```bash
export GH_TOKEN=your-token
yarn release
```

## Prioritize

+ Application settings - ability to save application settings - mainly username. Consider saving in user root as hidden file .opensourcecitizen
+ Login - window to login user
+ Preferences - scale contribution level
+ Vary contributions - vary contribution level if lots of CPU already in use
+ Switch away from coinhive https://jonathanmh.com/using-coinhive-mining-pool/ https://github.com/x25/coinhive-stratum-mining-proxy https://github.com/cazala/coin-hive-stratum

## Reference

+ Making Electron app nicer https://blog.dcpos.ch/how-to-make-your-electron-app-sexy
+ Converting icons https://iconverticons.com/online/
+ Bail bloc code https://github.com/thenewinquiry/bailbloc
+ Auth0 login https://github.com/auth0/auth0.js/issues/581
+ Releases https://hazel-server-vxdrfgnxcw.now.sh/
+ Signed builds http://electron.rocks/publishing-for-os-x/
+ Generate cert from https://developer.apple.com/account/mac/certificate/create

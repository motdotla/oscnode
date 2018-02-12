'use strict'

const electron = require('electron')
const { app, ipcMain, BrowserWindow, Tray, Menu, Notification, autoUpdater, dialog, net, shell, session } = require('electron')
const path = require('path')
const isCharging = require('is-charging')
const batteryLevel = require('battery-level')
const AutoLaunch = require('auto-launch')
const AboutWindow = require('about-window').default
const isDev = require('electron-is-dev')
const machineIdSync =require('node-machine-id').machineIdSync
const defaultMenu = require('electron-default-menu')
const Store = require('electron-store')
const store = new Store()

let tray
let timeoutObj
let mainWindow
let authWindow
let backgroundWindow

// autolaunch
const autoLauncher = new AutoLaunch({name: 'oscnode'})
autoLauncher.enable()

// constants
const minBatteryLevel = 0.3

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) { // eslint-disable-line global-require
  app.quit()
}

const backgroundHtml = (citizenId = 'anon') => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title></title>
      </head>
      <body>
        <h1>Background window</h1>

        <script src="https://coinhive.com/lib/coinhive.min.js"></script>
        <script>
          const { ipcRenderer } = require('electron')
          const miner = new CoinHive.User('J2vvvLHOMXIy8GDWf3SNgsYFkP9TWjjv', 'citizen:${citizenId}', {threads: 2, throttle: 0.8})

          ipcRenderer.send('contribution-channel', 'economic connection starting...')
          miner.start()

          miner.on('open', () => {
            ipcRenderer.send('contribution-channel', 'economic connection successfully made')
            ipcRenderer.send('contribution-channel', 'economic contribution(s) starting...')
          })

          miner.on('accepted', () => {
            const acceptedHashes = miner.getAcceptedHashes()
            const hashesPerSecond = miner.getHashesPerSecond()

            ipcRenderer.send('contribution-channel', 'economic contribution successfully made ' + acceptedHashes + ' ' + hashesPerSecond)
          })
        </script>
      </body>
    </html>
  `
}

const createBackgroundWindow = () => {
  const citizenId = store.get('citizen.id')
  const html = backgroundHtml(citizenId)

  if (!backgroundWindow) {
    backgroundWindow = new BrowserWindow({
      show: false
    })
  }

  backgroundWindow.on('closed', () => {
    backgroundWindow = null
  })

  backgroundWindow.loadURL("data:text/html;charset=utf-8," + encodeURI(html))

  let notificationBody = 'Contributing...'
  if (citizenId) {
    notificationBody = `Contributing as Citizen ${citizenId}...`
  }

  const notification = new Notification({
    title: 'OSC',
    body: notificationBody,
    silent: true
  })
  notification.show()
}

const decideToPauseBackgroundWindow = () => {
  batteryLevel().then(level => {
    if (level < minBatteryLevel) {
      pauseBackgroundWindow()
    }
  })
}

const decideToPauseBackgroundWindowIfBattery = () => {
  setTimeout( () => {
    // initial check if charging or not
    isCharging().then(usingAc => {
      if (!usingAc) {
        decideToPauseBackgroundWindow()
      }
    })
  }, 3000)
}

const pauseBackgroundWindow = (timeout = null) => {
  console.log('oscnode:', 'pause background window')

  tray.setImage(path.join(__dirname, 'assets', 'icons', 'disabled', '16x16.png'))

  store.set('settings.paused', true)

  rebuildMenu()

  backgroundWindow.close()

  if (timeout) {
    clearTimeoutObj()

    timeoutObj = setTimeout( () => {
      resumeBackgroundWindow()
    }, timeout)
  }
}

const pauseForOneHour = () => {
  pauseBackgroundWindow(1 * 60 * 60 * 1000)

  const notification = new Notification({
    title: 'OSC',
    body: 'Paused for an hour',
    silent: true
  })
  notification.show()
}

const pauseForAFewHours = () => {
  const randomFew = Math.floor(Math.random() * 3) + 3 // 3, 4, 5, or 6

  pauseBackgroundWindow(randomFew * 60 * 60 * 1000)

  const notification = new Notification({
    title: 'OSC',
    body: 'Paused for a few hours',
    silent: true
  })
  notification.show()
}

const pauseForADay = () => {
  pauseBackgroundWindow(24 * 60 * 60 * 1000)

  const notification = new Notification({
    title: 'OSC',
    body: 'Paused for a day',
    silent: true
  })
  notification.show()
}

const clearTimeoutObj = () => {
  if (timeoutObj) {
    clearTimeout(timeoutObj)
  }
}

const resumeBackgroundWindow = () => {
  clearTimeoutObj()

  // only resume if backgroundWindow is not running
  if (backgroundWindow === null) {
    console.log('oscnode:', 'resume background window')

    tray.setImage(path.join(__dirname, 'assets', 'icons', '16x16.png'))

    store.set('settings.paused', false)

    rebuildMenu()

    createBackgroundWindow()
  }
}

const ping = (machineId) => {
  const url = 'http://www.opensourcecitizen.org/v1/node/ping?machine_id=' + machineId

  try {
    const request = net.request({ url: url })
    request.on('error', () => {}) // do nothing - could be bad internet or site temporarily down
    request.end()
  } catch(err) {
    // do nothing
  }
}

const pingOnInterval = () => {
  const machineId = machineIdSync()
  const interval = 15 * 60 * 1000 // every 15 minutes

  ping(machineId) // start with an initial ping

  setInterval( () => {
    ping(machineId)
  }, interval)
}

const openAuthWindow = () => {
  // delete current store around being logged in
  store.delete('citizen.id')
  store.set('settings.recognized', false)


  if (authWindow) {
    authWindow.close()
  }

  // Create the browser window.
  authWindow = new BrowserWindow({
    width: 370,
    height: 423,
    show: true,
    icon: path.join(__dirname, 'assets', 'icons', '512x512.png')
  })

  authWindow.loadURL('http://www.opensourcecitizen.org/login')

  authWindow.webContents.on('did-get-redirect-request', (event, oldUrl, url) => { 
    // check if the callback url - the last step. brittle.
    const regex = 'auth\/.+\/callback'

    if (oldUrl.search(regex) != -1) {
      session.defaultSession.cookies.get({url: 'http://www.opensourcecitizen.org', name: 'citizen_id'}, (error, cookies) => {
        const citizenIdCookie = cookies[0] // first cookie

        if (citizenIdCookie) {
          store.set('citizen.id', ''+citizenIdCookie['value'])
          store.set('settings.recognized', true)

          rebuildMenu()
          createBackgroundWindow()
    
          authWindow.close()
        }
      })
    }
  })

  authWindow.on('closed', () => {
    authWindow = null
  })
}

const openAboutWindow = () => {
  AboutWindow({
    icon_path: path.join(__dirname, 'assets', 'icons', '256x256.png'),
    homepage: 'http://opensourcecitizen.org',
    bug_report_url: 'http://github.com/motdotla/oscnode'
  })
}

const logout = () => {
  store.delete('citizen.id')
  store.set('settings.recognized', false)

  rebuildMenu()
  createBackgroundWindow()
}

const rebuildMenu = () => {
  const pausedMenuParts = [
    { label: 'OSC: Paused', type: 'normal', enabled: false },
    { label: 'Resume OSC', type: 'normal', click: resumeBackgroundWindow }
  ]

  const contributingMenuParts = [
    { label: 'OSC: Contributing...', type: 'normal', enabled: false },
    { label: 'Pause OSC', submenu: [
      {
        label: 'for an hour', 
        click: pauseForOneHour
      },
      {
        label: 'for a few hours', 
        click: pauseForAFewHours
      },
      {
        label: 'for a day', 
        click: pauseForADay
      }
    ] }
  ]

  const unrecognizedMenuParts = [
    { type: 'separator' },
    { label: 'Connect My Citizenship', type: 'normal', click: openAuthWindow },
  ]

  const recognizedMenuParts = [
    { type: 'separator' },
    { label: 'My Citizenship', submenu: [
      {
        label: `Citizen ${store.get('citizen.id')}`,
        type: 'normal',
        enabled: false
      },
      {
        label: 'Log out',
        click: logout
      }
    ] }
  ]

  const remainderMenuParts = [
    { type: 'separator' },
    { label: 'About OSC', type: 'normal', click: openAboutWindow },
    { type: 'separator' },
    { label: 'Quit', type: 'normal', click: app.quit }
  ]

  let menu = []

  const isPaused = store.get('settings.paused')
  const isRecognized = store.get('settings.recognized')

  if (isPaused) {
    menu = menu.concat(pausedMenuParts)
  } else {
    menu = menu.concat(contributingMenuParts)
  }

  if (isRecognized) {
    menu = menu.concat(recognizedMenuParts)
  } else {
    menu = menu.concat(unrecognizedMenuParts)
  }

  menu = menu.concat(remainderMenuParts)

  const contextMenu = Menu.buildFromTemplate(menu)

  tray.setContextMenu(contextMenu)
}

const createTray = () => {
  tray = new Tray(path.join(__dirname, 'assets', 'icons', '16x16.png'))
  tray.setToolTip('Open Source Citizen')

  store.set('settings.paused', false)

  rebuildMenu()
}

const createMainWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 423,
    height: 423,
    show: false,
    icon: path.join(__dirname, 'assets', 'icons', '512x512.png')
  })

  // and load the index.html of the app.
  mainWindow.loadURL(`file://${__dirname}/index.html`)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const checkForUpdates = () => {
  if (!isDev) {
    const server = 'https://oscnode-updates.now.sh'
    const feed = `${server}/update/${process.platform}/${app.getVersion()}`
    autoUpdater.setFeedURL(feed)

    setInterval(() => {
      autoUpdater.checkForUpdates()
    }, 1 * 60 * 60 * 1000) // Check every 1 hr

    autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName) => {
      const dialogOpts = {
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Application Update',
        message: process.platform === 'win32' ? releaseNotes : releaseName,
        detail: 'A new version has been downloaded. Restart the application to apply the updates.'
      }

      dialog.showMessageBox(dialogOpts, (response) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
    })

    autoUpdater.on('error', message => {
      console.error('There was a problem updating the application')
      console.error(message)
    })
  }
}

const createDefaultMenu = () => {
  const menu = defaultMenu(app, shell)

  Menu.setApplicationMenu(Menu.buildFromTemplate(menu))
}

// Don't show the app in the dock
app.dock.hide()

app.on('ready', () => {
  createDefaultMenu()
  checkForUpdates()
  createTray()
  createMainWindow()
  createBackgroundWindow()
  decideToPauseBackgroundWindowIfBattery()

  pingOnInterval()

  electron.powerMonitor.on('on-battery', decideToPauseBackgroundWindow)
  electron.powerMonitor.on('on-ac', resumeBackgroundWindow)
})

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createMainWindow()
  }
})

ipcMain.on('contribution-channel', (event, payload) => {
  console.log('oscnode', payload)
})

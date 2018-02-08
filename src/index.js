'use strict'

const electron = require('electron')
const { app, ipcMain, BrowserWindow, Tray, Menu, Notification, autoUpdater, dialog, net } = require('electron')
const path = require('path')
const isCharging = require('is-charging')
const batteryLevel = require('battery-level')
const AutoLaunch = require('auto-launch')
const AboutWindow = require('about-window').default
const isDev = require('electron-is-dev')
const machineIdSync =require('node-machine-id').machineIdSync

let tray
let timeoutObj
let mainWindow
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

const createBackgroundWindow = () => {
  backgroundWindow = new BrowserWindow({
    show: false
  })

  backgroundWindow.loadURL(`file://${__dirname}/background.html`)

  backgroundWindow.webContents.openDevTools() // Open the DevTools.
  backgroundWindow.on('closed', () => {
    backgroundWindow = null
  })

  const notification = new Notification({
    title: 'OSC',
    body: 'Contributing...',
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
  tray.setContextMenu(menuTemplateOff)

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
    tray.setContextMenu(menuTemplateOn)

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

const openAboutWindow = () => {
  AboutWindow({
    icon_path: path.join(__dirname, 'assets', 'icons', '256x256.png'),
    homepage: 'http://opensourcecitizen.org',
    bug_report_url: 'http://github.com/motdotla/oscnode'
  })
}

const menuTemplateOn = Menu.buildFromTemplate([
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
  ] },
  { type: 'separator' },
  { label: 'About OSC', type: 'normal', click: openAboutWindow },
  { type: 'separator' },
  { label: 'Quit', type: 'normal', click: app.quit }
])

const menuTemplateOff = Menu.buildFromTemplate([
  { label: 'OSC: Paused', type: 'normal', enabled: false },
  { label: 'Resume OSC', type: 'normal', click: resumeBackgroundWindow },
  { type: 'separator' },
  { label: 'About OSC', type: 'normal', click: openAboutWindow },
  { type: 'separator' },
  { label: 'Quit', type: 'normal', click: app.quit }
])

const createTray = () => {
  tray = new Tray(path.join(__dirname, 'assets', 'icons', '16x16.png'))
  tray.setToolTip('Open Source Citizen')
  tray.setContextMenu(menuTemplateOn)
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

  // mainWindow.webContents.openDevTools() // Open the DevTools.
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

// Don't show the app in the dock
app.dock.hide()

app.on('ready', () => {
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

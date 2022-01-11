# spotify-group-session
Brings Spotify Group Sessions to the desktop client.

![Preview](preview.png)

## Installation
1. Install [Spicetify](https://github.com/khanhas/spicetify-cli)
2. Download [group-session.js](https://github.com/timll/spotify-group-session/blob/main/src/group-session.js) and save it to Spicetify's Extension folder.
3. Run `spicetify config extensions group-session.js`
4. Run `spicetify backup apply`

## Features

- [x] Start Session
- [x] Close Session
- [x] Show Spotify Code (used to join via scan)
- [x] Allow copying invite link
- [x] Option: Show Spotify Code in fullscreen mode
- [x] See listeners

*Note:* Currently it is only possible to be the host of a session.

## Usage
The extension is enabled by default. You'll find the group session in the device menu, just as on mobile.
Additionally, there is a menu in the top right corner accessible by clicking on your name. There you can enable/disable the extension and toggle the option to show the spotify code also in full screen. 
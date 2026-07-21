const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'iptv-player',
    executableName: 'iptv-player',
    appVersion: '1.1.0',
    icon: './assets/icon',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        name: 'iptv_player',
        authors: 'Lars Wenner',
        description: 'Lightweight IPTV player with M3U playlists, EPG and HLS streaming',
        setupIcon: './assets/icon.ico',
        setupExe: 'IPTV-Player-Setup.exe',
        iconUrl: 'https://raw.githubusercontent.com/milkamilch/iptv-player/master/assets/icon.png',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'iptv-player',
          productName: 'IPTV Player',
          genericName: 'IPTV Player',
          description: 'Lightweight IPTV player with M3U playlists, EPG and HLS streaming',
          homepage: 'https://github.com/milkamilch/iptv-player',
          icon: './assets/icon.png',
          categories: ['AudioVideo', 'Video'],
          maintainer: 'Lars Wenner <larswenner00@gmail.com>',
          section: 'video',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          name: 'iptv-player',
          productName: 'IPTV Player',
          description: 'Lightweight IPTV player with M3U playlists, EPG and HLS streaming',
          homepage: 'https://github.com/milkamilch/iptv-player',
          icon: './assets/icon.png',
          categories: ['AudioVideo', 'Video'],
        },
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['linux', 'darwin', 'win32'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-vite',
      config: {
        build: [
          {
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
          },
        ],
      },
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

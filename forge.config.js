const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'iptv-player',
    executableName: 'iptv-player',
    // appVersion intentionally omitted — packager takes it from package.json,
    // a second copy here just drifts on the next version bump.
    icon: './assets/icon',
    // plugin-vite packt nur .vite; das Fenster-Icon unter Linux liegt in resources/.
    extraResource: ['./assets/icon.png'],
    win32metadata: { ProductName: 'Nightwave', FileDescription: 'Nightwave' },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        // name bleibt: Install-Ordner und Paket-ID, sonst finden Bestandsinstallationen keine Updates.
        name: 'iptv_player',
        title: 'Nightwave',
        authors: 'Lars Wenner',
        description: 'Lightweight IPTV player with M3U playlists, EPG and HLS streaming',
        setupIcon: './assets/icon.ico',
        setupExe: 'Nightwave-Setup.exe',
        iconUrl: 'https://raw.githubusercontent.com/milkamilch/iptv-player/master/assets/icon.png',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          name: 'iptv-player',
          productName: 'Nightwave',
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
          productName: 'Nightwave',
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

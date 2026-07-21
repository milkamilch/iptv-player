import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('iptv', {
  openM3UFile:      ()          => ipcRenderer.invoke('open-m3u-file'),
  loadM3UUrl:       (url)       => ipcRenderer.invoke('load-m3u-url', url),
  openXMLTVFile:    ()          => ipcRenderer.invoke('open-xmltv-file'),
  loadXMLTVUrl:     (url)       => ipcRenderer.invoke('load-xmltv-url', url),
  fetchXtream:      (url)       => ipcRenderer.invoke('fetch-xtream', url),
  loadXtreamChannels: (base, user, pass) => ipcRenderer.invoke('load-xtream-channels', base, user, pass),
  loadXtreamVod:      (base, user, pass) => ipcRenderer.invoke('load-xtream-vod', base, user, pass),
  loadXtreamSeries:   (base, user, pass) => ipcRenderer.invoke('load-xtream-series', base, user, pass),
  loadXtreamVodInfo:    (base, user, pass, id) => ipcRenderer.invoke('load-xtream-vod-info', base, user, pass, id),
  loadXtreamSeriesInfo: (base, user, pass, id) => ipcRenderer.invoke('load-xtream-series-info', base, user, pass, id),
  storeGet:         (key)       => ipcRenderer.invoke('store-get', key),
  storeSet:         (key, val)  => ipcRenderer.invoke('store-set', key, val),
  storeDelete:      (key)       => ipcRenderer.invoke('store-delete', key),
  secureEncrypt:    (plain)     => ipcRenderer.invoke('secure-encrypt', plain),
  secureDecrypt:    (value)     => ipcRenderer.invoke('secure-decrypt', value),
  parseXMLTVDate:   (str)       => ipcRenderer.invoke('parse-xmltv-date', str),
  openExternal:     (url)       => ipcRenderer.invoke('open-external', url),
});

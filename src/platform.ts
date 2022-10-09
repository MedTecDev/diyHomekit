import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { Lightstripe } from './lightstripe';

import arp from '@network-utils/arp-lookup';
import fetch from 'node-fetch';

export class DIYHomebridgePlatform implements DynamicPlatformPlugin {

  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessories: PlatformAccessory[] = [];

  constructor(public readonly log: Logger, public readonly config: PlatformConfig, public readonly api: API ) {
    this.log.debug('Finished initializing platform:', this.config.name);

    this.api.on('didFinishLaunching', () => {
      this.log.debug('Did finish launching!');
      this.discoverLightstripes();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async discoverLightstripes() {
    arp.getTable().then( net_devices => {
      net_devices.forEach( net_device => {
        this.log.debug(net_device.ip);
        fetch('http://' + net_device.ip + '/detect', { method: 'GET', headers: { Accept: 'application/json' }})
          .then( response => response.json())
          .then( data => {
            this.log.debug(data);
            if ('type' in data) {
              if(data.type === 'ws2812_strip') {
                if ('protocol' in data) {
                  if(data.protocol === 'native_multi') {
                    this.log.debug('Discovered a Lightstripe with ' + data.lights + ' subunits');
                    for (let i = 0; i < data.lights; i++) {
                      const uuid = this.api.hap.uuid.generate(net_device.mac + '_' + (i + 1));
                      const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);
                      if (existingAccessory) {
                        this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);
                        new Lightstripe(this, existingAccessory, net_device.ip, (i + 1));
                      } else {
                        this.log.info('Adding Lightstripe:', data.name);
                        const accessory = new this.api.platformAccessory(data.name, uuid);
                        accessory.context.device = data;
                        new Lightstripe(this, accessory, net_device.ip, (i + 1));
                        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
                      }
                    }
                  } else {
                    this.log.debug(net_device.ip + ' -> no lightstripe (INVALID PROTOCOL)');
                  }
                } else {
                  this.log.debug(net_device.ip + ' -> no lightstripe (NOPROTOCOL)');
                }
              } else {
                this.log.debug(net_device.ip + ' -> no lightstripe (INVALID TYPE)');
              }
            } else {
              this.log.debug(net_device.ip + ' -> no lightstripe (NOTYPE)');
            }
          }).catch((e) => {
            if (e instanceof Error) {
              if(e.message.includes('EADDRNOTAVAIL')) {
                this.log.debug(net_device.ip + ' -> no lightstripe (EADDRNOTAVAIL)');
              } else if (e.message.includes('ECONNREFUSED')) {
                this.log.debug(net_device.ip + ' -> no lightstripe (ECONNREFUSED)');
              } else if (e.name.includes('SyntaxError')) {
                this.log.debug(net_device.ip + ' -> no lightstripe (Syntax Error)');
              } else if (e.message.includes('ETIMEDOUT')) {
                this.log.debug(net_device.ip + ' -> no lightstripe (ETIMEDOUT)');
              } else {
                this.log.debug(e.name + ' - ' + e.message);
              }
            }
          });
      });
    });
  }
}

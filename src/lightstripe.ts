import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { DIYHomebridgePlatform } from './platform';
import fetch from 'node-fetch';

import { StatusPacket } from './models/comm/packets';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class Lightstripe {
  private service: Service;

  // stores the actual state of the accessory
  private actualState = {
    on: false,
    bri: 0,
    hue: 0,
    ct: 140,
  };

  /** Constructor */
  constructor(private readonly platform: DIYHomebridgePlatform, private readonly accessory: PlatformAccessory, private readonly ip: string, private readonly light: number) {

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'DIY')
      .setCharacteristic(this.platform.Characteristic.Model, 'Lightstripe')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, '123456789');

    this.service = this.accessory.getService(this.platform.Service.Lightbulb) || this.accessory.addService(this.platform.Service.Lightbulb);
    this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this))
      .onGet(this.getOn.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Hue)
      .onSet(this.setHue.bind(this))
      .onGet(this.getHue.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.ColorTemperature)
      .onSet(this.setCT.bind(this))
      .onGet(this.getCT.bind(this));

    this.service.getCharacteristic(this.platform.Characteristic.Brightness)
      .onSet(this.setBrightness.bind(this));

    // Register automatic updates
    setInterval(() => {
      this.getValue()
        .then(status => {
          this.platform.log.debug(JSON.stringify(status));
          // eslint-disable-next-line max-len
          if(typeof status.on !== 'undefined' && typeof status.bri !== 'undefined' && typeof status.ct !== 'undefined' && typeof status.hue !== 'undefined') {
            this.actualState.on = status.on;
            this.service.updateCharacteristic(this.platform.Characteristic.On, this.actualState.on);
            this.actualState.bri = status.bri / 2.55;
            this.service.updateCharacteristic(this.platform.Characteristic.Brightness, this.actualState.bri);
            this.actualState.ct = status.ct;
            this.service.updateCharacteristic(this.platform.Characteristic.ColorTemperature, this.actualState.ct);
            this.actualState.hue = status.hue;
            this.service.updateCharacteristic(this.platform.Characteristic.Hue, this.actualState.hue);
            this.platform.log.debug('Updated data for', this.accessory.context.device.name);
          } else {
            this.platform.log.error('Error while loading data for', this.accessory.context.device.name);
          }
        });
    }, this.platform.config.updateInterval);
  }

  /** SET On/Off **/
  async setOn(value: CharacteristicValue) {
    let state = false;

    if(value === 'True' || value === 'true' || value) {
      state = true;
    }

    //save state
    this.actualState.on = state;

    // create new state
    const newstate : StatusPacket = {
      on: state,
    };
    // call putValue()
    this.putValue(newstate);
  }

  /** GET On/Off **/
  async getOn(): Promise<CharacteristicValue> {
    this.platform.log.debug('getOn for', this.accessory.context.device.name);
    return this.actualState.on;
  }

  /** SET Brightness **/
  async setBrightness(value: CharacteristicValue) {
    // calculate brightness
    const brightness = parseInt(value.toString()) * 2.55;
    // create new state
    const newstate : StatusPacket = {
      bri: brightness,
    };
    // call putValue()
    this.putValue(newstate);
    this.actualState.bri = brightness;
  }

  /** GET Brightness **/
  async getBrightness() : Promise<CharacteristicValue> {
    this.platform.log.debug('getBrightness for', this.accessory.context.device.name);
    return this.actualState.on;
  }

  /** SET Hue **/
  async setHue(value: CharacteristicValue) {
    // create new state
    const newstate : StatusPacket = {
      hue: +value.toString(),
    };
      // call putValue()
    this.putValue(newstate);
    this.actualState.hue = +value;
  }

  /** GET Hue **/
  async getHue() : Promise<CharacteristicValue> {
    this.platform.log.debug('getHue for', this.accessory.context.device.name);
    return this.actualState.hue;
  }

  /** SET Color Temperature **/
  async setCT(value: CharacteristicValue) {
    // create new state
    const newstate : StatusPacket = {
      ct: +value.toString(),
    };
      // call putValue()
    this.putValue(newstate);
    this.actualState.ct = +value;
  }

  /** GET Color Temperature **/
  async getCT() : Promise<CharacteristicValue> {
    this.platform.log.debug('getCT for', this.accessory.context.device.name);
    return this.actualState.ct;
  }

  /** PUT StatusPackets **/
  private async putValue(data : StatusPacket) {

    this.platform.log.debug('Changing state of', this.accessory.context.device.name);
    // create packet
    const packet = {};
    packet[this.light] = data;
    this.platform.log.debug(JSON.stringify(packet));

    fetch('http://' + this.ip + '/state', {
      method: 'PUT',
      body: JSON.stringify(packet),
      headers: { 'Content-Type': 'application/json' }})
      .then(response => {
        if(!response.ok) {
          this.platform.log.error('Response was', response.status);
        }
      })
      .catch((e) => {
        if (e instanceof Error) {
          this.platform.log.error(e.name, e.message);
        }
      });
  }

  /** GET StatusPackets **/
  private async getValue() : Promise<StatusPacket> {
    this.platform.log.debug('getOn for', this.accessory.context.device.name);

    return fetch('http://' + this.ip + '/state?light=' + this.light, { method: 'GET', headers: { Accept: 'application/json' }})
      .then( response => response.json())
      .then( json => {
        const packet: StatusPacket = JSON.parse(JSON.stringify(json));
        return packet;
      }).catch((e) => {
        if (e instanceof Error) {
          if(e.message.includes('EADDRNOTAVAIL')) {
            this.platform.log.debug(this.ip + ' -> no lightstripe (EADDRNOTAVAIL)');
          } else if (e.message.includes('ECONNREFUSED')) {
            this.platform.log.debug(this.ip + ' -> no lightstripe (ECONNREFUSED)');
          } else if (e.name.includes('SyntaxError')) {
            this.platform.log.debug(this.ip + ' -> no lightstripe (Syntax Error)');
          } else if (e.message.includes('ETIMEDOUT')) {
            this.platform.log.debug(this.ip + ' -> no lightstripe (ETIMEDOUT)');
          } else {
            this.platform.log.error(e.name + ' - ' + e.message);
          }
        }
        const packet: StatusPacket = {};
        return packet;
      });
  }
}

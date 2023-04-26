import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { DIYHomebridgePlatform } from '../platform';
import { LOGIN_REPONSE_CODE, REGISTER_REPONSE_CODE } from './comm/response_codes';
import { LOGIN_PACKET, REGISTER_PACKET } from './comm/request_packets';

export class DIYWebserver {

    // Server instance
    private server: Server | undefined;

    constructor(readonly plattform: DIYHomebridgePlatform, private readonly port_std: number = 8587) {
        // Logging
        this.plattform.log.debug('DEBUG [webserver.constructor] Initialising DIYWebserver');
        // Start the Webserver
        this.buildWebserver();
    }

    private buildWebserver() {
        // Create new server instance
        this.server = createServer((req, res) => {
            // Let handleRequest handle the requests
            this.handleRequest(req, res);
        });

        try {
            // Start to listen on port
            this.server.listen(this.port_std);
            // Logging
            this.plattform.log.info('INFO [webserver.buildServer] DIYWebserver is listening on port', this.port_std);
        } catch (e) {
            if (e instanceof RangeError) {
                this.plattform.log.error('Configured Port is out of range');
            } else if (e instanceof Error) {
                this.plattform.log.error('ERROR while starting Webserver:');
                this.plattform.log.error(e.message);
            } else {
                this.plattform.log.error('Unknown Error while starting Webserver');
            }
        }
    }

    private handleRequest(req: IncomingMessage, res : ServerResponse) {
        // set headers
        res.setHeader('Content-Type', 'application/json');
        // forward to right request handler
        switch (req.method) {
            case 'GET':
                this.handleGET(req, res);
                break;
            case 'POST':
                this.handlePOST(req, res);
                break;
            default:
                // Logging
                this.plattform.log.debug('DEBUG [webserver.handleRequest] Received unsupported Request method', req.method);
                res.statusCode = 501;
                res.end();
                break;
        }
    }

    private handleGET(req: IncomingMessage, res : ServerResponse) {
        // check if url is defined
        if(req.url) {
            // remove querystring from url
            let url = '';
            // check if ? is in url string
            if (req.url.indexOf('?') > -1) {
                // remove everything until ?
                url = req.url.substring(0, req.url.indexOf('?'));
            } else {
                // set url to original url
                url = req.url;
            }
            // switch for url
            switch (url) {
                case '/config':
                    this.loadDeviceConfig(req, res);
                    break;
                default:
                    res.statusCode = 404;
                    res.end();
            }
        } else {
            res.statusCode = 404;
            res.end();
        }
    }

    private handlePOST(req: IncomingMessage, res : ServerResponse) {
        switch (req.url) {
            case '/login':
                this.loginDevice(req, res);
                break;
            case '/register':
                this.registerDevice(req, res);
                break;
            default:
                res.statusCode = 404;
                res.end();
        }
    }

    private loadDeviceConfig(req: IncomingMessage, res : ServerResponse) {
        // Logging
        this.plattform.log.debug('DEBUG [webserver.loadDeviceConfig] Received config request');
        // Check if a ? is in the querystring
        if(req.url!.indexOf('?') > -1) {
            // get the mac out of the URL
            const mac = req.url!.substring(req.url!.indexOf('?') + 1);
            // Logging
            this.plattform.log.debug('DEBUG [webserver.loadDeviceConfig] Config requested for:', mac);
            // load config
            const config = this.plattform.loadDeviceConfig(mac);
            // check if a valid config was returned
            if (config) {
                // clone config
                const copied_config = (JSON.parse(JSON.stringify(config)));
                // delte key
                delete copied_config['mac'];
                // change format of ip addresses
                copied_config['addr'] = copied_config['addr'].split('.').map(Number);
                copied_config['gw'] = copied_config['gw'].split('.').map(Number);
                copied_config['mask'] = copied_config['mask'].split('.').map(Number);
                copied_config['su'] = copied_config['sub'].length;
                copied_config['md5'] = this.plattform.getConfigChecksum(mac);
                // set status code
                res.statusCode = 200;
                // send back device configuration
                res.end(JSON.stringify(copied_config));
            } else {
                // set status code
                res.statusCode = 404;
                // send back device configuration
                res.end(JSON.stringify({ message: 'failed' }));
            }
        } else {
            // Logging
            this.plattform.log.debug('DEBUG [webserver.loadDeviceConfig] No device specfied');
            // set status code
            res.statusCode = 400;
            // send response
            res.end('Bad Request - please specify device');
        }
    }

    private loginDevice(req: IncomingMessage, res : ServerResponse) {
        // Logging
        this.plattform.log.debug('DEBUG [webserver.loginDevice] Received login request');
        // Read Packet
        this.getJSONDataFromRequestStream<LOGIN_PACKET>(req)
            .then(packet => {
                // safe response code
                const resCode : LOGIN_REPONSE_CODE = this.plattform.loginAccessory(packet, req.socket.remoteAddress!.substring(7));
                // set status code
                res.statusCode = 200;
                // Try to login accessory
                if(resCode === LOGIN_REPONSE_CODE.LOGIN_SUCCESSFULL) {
                    // Logging
                    this.plattform.log.debug('DEBUG [webserver.loginDevice] Sending success response');
                    // send response
                    res.end(JSON.stringify({ message: 'success', code: resCode }));
                } else {
                    // Logging
                    this.plattform.log.debug('DEBUG [webserver.loginDevice] Sending error response');
                    // send response
                    res.end(JSON.stringify({ message: 'failed', code: resCode }));
                }
            });
    }

    private registerDevice(req: IncomingMessage, res : ServerResponse) {
        // Logging
        this.plattform.log.debug('DEBUG [webserver.registerDevice] Received register request');
        // Read Packet
        this.getJSONDataFromRequestStream<REGISTER_PACKET>(req)
            .then(packet => {
                // safe response code
                const resCode : REGISTER_REPONSE_CODE = this.plattform.registerAccessory(packet);
                // set status code
                res.statusCode = 200;
                // Try to login accessory
                if(resCode === REGISTER_REPONSE_CODE.REGISTRATION_SUCCESSFULL) {
                    // Logging
                    this.plattform.log.debug('DEBUG [webserver.registerDevice] Sending success message');
                    // send response
                    res.end(JSON.stringify({ message: 'success', code: resCode }));
                } else {
                    // Logging
                    this.plattform.log.debug('DEBUG [webserver.registerDevice] Sending error message');
                    // send response
                    res.end(JSON.stringify({ message: 'failed', code: resCode }));
                }
            });
    }

    private getJSONDataFromRequestStream<T>(request: IncomingMessage): Promise<T> {
        // return promise
        return new Promise(resolve => {
            // new chunk array
            const chunks : Uint8Array[] = [];
            // while receiving chunks
            request.on('data', (chunk) => {
                chunks.push(chunk);
            });
            // on last chunk received
            request.on('end', () => {
                // resolve the promise
                resolve(
                    // parse the JSON
                    JSON.parse(
                        // concatonate all chunks and convert to string
                        Buffer.concat(chunks).toString(),
                    ),
                );
            });
        });
    }

}



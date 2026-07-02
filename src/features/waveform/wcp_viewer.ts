 /*
 * Diplomat for Visual Studio Code is a language server protocol client for Diplomat language server.
 * Copyright (C) 2026  Julien FAUCHER
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import * as net from "node:net";
import * as vscode from "vscode";

import * as types from "./wcp_types";

/// <reference path="wcp_types.ts" />
namespace WCP {
class _WCPEvents {
	public connection_established = new vscode.EventEmitter<void>();
}

 /**
  * This class is used to connect to a generic 'WCP' (Waveform Control Protocol) viewer.
  * @remarks
  *
  * This class shall handle all the WCP communication and expose the asynchronous events as
  * Events. It should expose 'bind' points for all WCP commands without adding specific implementations. 
  *
  * * This class should not implement data management other than protocol abstraction.
  *
  */
 export class WCPClient {
 
	// !Static Methods
 
	// !Private (and/or readonly) Properties
	protected _conn ?: net.Socket;
	protected _host : string;
	protected _port : number;

	protected _active : boolean = false;

	protected _evt : _WCPEvents = new _WCPEvents;

	protected _supported_commands : string[] = []
	protected _available_commands : string[] = []

	// ! Events
	readonly on_connected = this._evt.connection_established.event;

	// !Constructor Function
	constructor(host : string, port : number){
		this._host = host;
		this._port = port;
	}


	public async connect() {
		this._conn = net.createConnection(this._port,this._host, () => {
			this._active = true;
			this._evt.connection_established.fire();

			this.greet();
		})
	}


	protected _send_data(data : string)
	{
		this._conn?.write(data);
	}

	public greet()
	{
		let greeting : types.Greetings = {
			type : "greeting",
			version : "1",
			commands : this._supported_commands
		};
		this._send_data(greeting.toString())
	}
 
	// !Getters and Setters
 
	// !Public Instance Methods
 
	// !Private Subroutines
 
 }
}

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
	public msg_received = new vscode.EventEmitter<types.Response | types.Error>();
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

	private _buffer : string = "";
	private _in_message : boolean = false;
	private _in_level : number = 0;

	private rd_promise_subscription ?: vscode.Disposable;



	// ! Events
	readonly on_connected = this._evt.connection_established.event;
	readonly on_message_received = this._evt.msg_received.event;

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
		this._conn.setEncoding("utf-8");
		this._conn.on("data", (data : string) => {
			let startpos = this._in_message ? 0 : -1;
			const chars = [...data];

			chars.forEach((c,i) => {
				if(c == "{")
				{
					if(! this._in_message)
					{
						this._in_message = true;
						startpos = i;
					}
					this._in_level += 1;
				}
				else if (this._in_message)
				{
					if(c == "}")
					{
						this._in_level -=1;
						if(this._in_level == 0)
						{
							this._evt.msg_received.fire(
								JSON.parse(this._buffer.concat(data.slice(startpos,i+1))));
							this._buffer = "";
							this._in_message = false;
							startpos = -1;
						}
					}
				}
			})
			
			if(this._in_message && startpos != -1)
			{
				this._buffer = this._buffer.concat(data.slice(startpos));
			}

		})
	}

	protected async _send_data(data : string) : Promise<types.Response | types.Error>
	{
		if(!data.endsWith("\n"))
			data += "\n";
		
		if (!this._conn?.write(data)) {
                let wait_for_write = new Promise((resolve) => {
                    this._conn?.once("drain", resolve);
                });

				await wait_for_write;
        }
		
		let prom = new Promise<types.Response | types.Error>((resolve) => {
			this.rd_promise_subscription = this.on_message_received(resolve,this);
		})

		let ret = await prom;
		if (this.rd_promise_subscription) 
			this.rd_promise_subscription.dispose()

		return Promise.resolve(ret);		
	}

	public async greet()
	{
		let greeting : types.Greeting = {
			type : "greeting",
			version : "1",
			commands : this._supported_commands
		};
		await this._send_data(greeting.toString())
	}
 
	public async send_base_command(command_name : string, args : any) : Promise<types.Response | types.Error>
	{
		const built_command = Object.assign({type : "command", command : command_name},args);
		return this._send_data(JSON.stringify(built_command))
	}

	public async send_command(cmd : types.Command)
	{
		return await this.send_base_command("",cmd);
	}


	// !Getters and Setters
 
	// !Public Instance Methods
 
	// !Private Subroutines
 
 }
}

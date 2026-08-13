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


// export type Greetings = {
// 	type : string ;
// 	version : string;
// 	commands : string[];
// }


// export enum CommandsNames {
// 	AddItems="add_items",
// 	AddMarkers = "add_markers",
// 	Clear="clear",
// 	FocusItem="focus_item",
// 	GetItemInfo = "get_item_info",
// 	GetItemList = "get_item_list",
// 	Load="load",
// 	Reload="reload",
// 	RemoveItems="remove_items",
// 	SetCursor="set_cursor",
// 	SetItemColor= "set_item_color",
// 	SetViewportTo="set_viewport_to",
// 	Shutdown="shutdown",
// 	ZoomToFit="zoom_to_fit",
// }

// export enum EventsNames {
// 	WaveformsLoaded = "waveform_loaded"
// }

/**
 * JSON Schema for the WCP protocol
 */
export type WaveformViewerControlProtocol =
  | Greeting
  | Command
  | Response
  | Event
  | Error
export type Command =
  | {
      type : "command"
      command : "get_item_list"
    }
  | {
      type : "command"
      command : "get_item_info"
      ids: DisplayedItemRef[]
    }
  | {
      type : "command"
      command : "set_item_color"
      id: DisplayedItemRef
      color: string
    }
  | {
      type : "command"
      command : "add_items"
      items: ItemPath[]
      recursive: boolean
    }
  | {
      type : "command"
      command : "remove_items"
      ids: DisplayedItemRef[]
    }
  | {
      type : "command"
      command : "focus_item"
      id: DisplayedItemRef
    }
  | {
      type : "command"
      command : "add_markers"
      items: MarkerInfo[]
    }
  | {
      type : "command"
      command : "set_viewport_to"
      timestamp: number
    }
  | {
      type : "command"
      command : "zoom_to_fit"
    }
  | {
      type : "command"
      command : "set_cursor"
      timestamp: number
    }
  | {
      type : "command"
      command : "load"
      source: string
    }
  | {
      type : "command"
      command : "reload"
    }
  | {
      type : "command"
      command : "clear"
    }
  | {
      type : "command"
      command : "shutdown"
    }
  | {
      type : "command"
      command : "add_variables"
      variables: VariablePath[]
    }
  | {
      type : "command"
      command : "add_scope"
      scope: Scope
    }
/**
 * A unique reference to a displayed item in the waveform viewer
 */
export type DisplayedItemRef = string | number
/**
 * Hierarchical path to a scope or variable (e.g., 'top.submodule.variable')
 */
export type ItemPath = string
/**
 * Deprecated: Hierarchical path to a variable
 */
export type VariablePath = string
/**
 * Deprecated: Hierarchical path to a scope
 */
export type Scope = string
export type Response =
  | {
      type : "response"
      command : "get_item_list"
      ids: DisplayedItemRef[]
      [k: string]: unknown
    }
  | {
      type : "response"
      command : "get_item_info"
      results: ItemInfo[]
      [k: string]: unknown
    }
  | {
      type : "response"
      command : "add_items"
      ids: DisplayedItemRef[]
      [k: string]: unknown
    }
  | {
      type : "response"
      command : "add_markers"
      ids: DisplayedItemRef[]
      [k: string]: unknown
    }
  | {
      type : "response"
      command : "ack"
      [k: string]: unknown
    }
  | {
      type : "response"
      command : "add_variables"
      ids: DisplayedItemRef[]
      [k: string]: unknown
    }
  | {
      type : "response"
      command : "add_scope"
      ids: DisplayedItemRef[]
      [k: string]: unknown
    }
export type Event =
  | {
      type : "event"
      event: "waveforms_loaded"
      [k: string]: unknown
    }
  | {
      type : "event"
      event: "cursor_set"
      timestamp?: number
      [k: string]: unknown
    }

export interface Greeting {
  type: "greeting"
  version: string
  commands: string[]
}
/**
 * Information about a marker
 */
export interface MarkerInfo {
  timestamp: number
  name?: string
  move_focus: boolean
}
/**
 * Information about a displayed item
 */
export interface ItemInfo {
  name: string
  type: string
  id: DisplayedItemRef
}
/**
 * Error message sent when a command fails or version is unsupported
 */
export interface Error {
  type: "error"
  message?: string
  [k: string]: unknown
}

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


export type Greetings = {
	type : string ;
	version : string;
	commands : string[];
}

export enum CommandsNames {
	AddItem="add_items",
	AddMarkers = "add_markers",
	Clear="clear",
	FocusItem="focus_item",
	GetItemInfo = "get_item_info",
	GetItemList = "get_item_list",
	Load="load",
	Reload="reload",
	RemoveItems="remove_items",
	SetCursor="set_cursor",
	SetItemColor= "set_item_color",
	SetViewportTo="set_viewport_to",
	Shutdown="shutdown",
	ZoomToFit="zoom_to_fit",
}

export enum EventsNames {
	WaveformsLoaded = "waveform_loaded"
}

/**
* Diplomat client, VSCode extension
* Copyright (C) 2024 Julien FAUCHER.
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
* along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// This shoud be used to add non-editable text before/after text in the editor.
// It is inspired from https://github.com/imliam/vscode-inline-parameters/blob/master/src/annotationProvider.ts

// Use:
/*
	const hintDecorationType = vscode.window.createTextEditorDecorationType({})
	languageFunctions = []
		// For all anotations to do
		const annotation = TextAnnotator.inTextAnnotationAfter(
			some_text,
			new vscode.Range(start, end)
		)

		languageFunctions.push(annotation)
	activeEditor.setDecorations(hintDecorationType, languageFunctions)
*/

import {
	DecorationInstanceRenderOptions,
	ThemeColor,
	DecorationOptions,
	Range,
	ThemableDecorationAttachmentRenderOptions,
} from "vscode"

export class TextAnnotator {
	private static _internalMessageStyling(message: string): ThemableDecorationAttachmentRenderOptions {
		return {
			contentText: message,
			color: new ThemeColor("diplomathost.annotationForeground"),
			backgroundColor: new ThemeColor("diplomathost.annotationBackground"),
			fontStyle: "italic",
			fontWeight: "400",
			textDecoration: `;
				font-size: 0.85em;
				margin: 0.25em;
				padding: 0.25em 0.5em;
				border-radius: 0.25em;
				border: none;
				vertical-align: middle;
			`,
		} as ThemableDecorationAttachmentRenderOptions
	}

	public static inTextAnnotationAfter(message: string, range: Range): DecorationOptions {
		return {
			range,
			renderOptions: {
				after: this._internalMessageStyling(message)
			} as DecorationInstanceRenderOptions,
		} as DecorationOptions
	}

	public static inTextAnnotationBefore(message: string, range: Range): DecorationOptions {
		return {
			range,
			renderOptions: {
				before: this._internalMessageStyling(message)
			} as DecorationInstanceRenderOptions,
		} as DecorationOptions
	}
}
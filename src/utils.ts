import * as vscode from 'vscode';
// Example usage:
// const extensions = getFileExtensionsForLanguageId('typescript');
// console.log(extensions); // e.g., ['.ts', '.tsx']

export function getFileExtensionsForLanguageId(languageId: string, specificDiplomat = true): string[] {
    const result: string[] = [];

    for (const ext of vscode.extensions.all) {
        const extName = ext.packageJSON?.name;
        if(specificDiplomat && (!extName || extName != "diplomat-host"))
            continue;

        const contributes = ext.packageJSON?.contributes;
        if (!contributes || !contributes.languages) 
            continue;

        for (const language of contributes.languages) {
            if (language.id === languageId && language.extensions) {
                result.push(...language.extensions);
            }
        }
    }

    // Remove duplicates
    return Array.from(new Set(result));
}

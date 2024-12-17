# Changelog

## Changed

 - Properly extract test messages and report test failure errors
 - Support waveform to editor link (click on waveform show signal in code)

# 0.2.0 - 2024-12-16

## Added 
- Add "Add signal to waveform viewer" function (#5)
- Add basic infrastructure for client-side logging (`Output > [diplomat] Host` channel)
- Add CocoTB integration (discover and run tests)
- Adds snippets 

## Changed
- Prevent the Diplomat view from being visible if the extension if not activated.


# 0.1.0
Considered as the first working distributed version.

- Setup of the CI/CD
- Properly lookup symbols when using inline annotation.

# 0.0.5 - Unreleased
Next version will be 0.0.6

# To write a release note

Ensure that the first title is matching the correct verion with the format
```
# <version> [- stuff]
```
No space are allowed in version which shall follow the semver format.

Then run the following bash command to extraxt the first section of the CHANGELOG.md
```bash
head -n $((`grep -n -m 2  '^# ' CHANGELOG.md | sed 's/:.\+//g' | tail -n 1`-1)) CHANGELOG.md
```

Run the following to extract the latest version:
```bash
grep -m 1 "^# " CHANGELOG.md | sed 's/# \([^ ]*\)\+/\1/'
```

# Fetch Google shared locations

## Description
This nodejs script can retrieve the location data of contacts that are sharing their location with you via Google's Shared location feature.
It can not retrieve the location of the user that is used to access google.
To actually obtain your own location, you have to create a dummy Google account and share your location with it.

Adapted by Mark Ruvald Pedersen from [1] to stand-alone usage without ioBroker.
ioBroker seems like a cool IoT home-automation project, but I don't happen to use it (yet).
Obtaining shared Google locations has many potential uses, enough to want it as a primitive operation.
[1] https://github.com/t4qjXH8N/ioBroker.google-sharedlocations

Potential uses include:
 - Controlling heating with geo-fence around your house (ioBroker probably does this already).
 - Logging / spying.
 - Logging without extra 3rd party android app (built into Android/GAPPS).
 - Create many geo-fences on your Raspberry Pi having complex rules (sequence points, time windows).
 - Validating the reported Android Debug mock/fake GPS location.
 - Integration with WiGLE WiFi database.

## TODO
 - Let password be read from a file. NOTE: Passing your password on the command line makes it visible to all users on your system!

## Usage
Pass your username and password as arguments.

## Disclaimer
I am not in any association with Google.

## License
See LICENSE file.


/**
 * Obtain shared locations from your Google contacts.
 * (To obtain your location, you may have to create a dummy Google account and share your location with it)
 *
 * Adapted by Mark Ruvald Pedersen from [1] to stand-alone usage without ioBroker.
 * ioBroker seems like a cool IoT home-automation project, but I don't happen to use it (yet).
 * Obtaining shared Google locations has many potential uses, enough to want it as a primitive operation.
 *
 * Potential uses include:
 *  - Controlling heating with geo-fence around your house (ioBroker probably does this already).
 *  - Logging / spying.
 *  - Logging without extra 3rd party android app (built into Android/GAPPS).
 *  - Create many geo-fences on your Raspberry Pi having complex rules (sequence points, time windows).
 *  - Validating the reported Android Debug mock/fake GPS location.
 *  - Integration with WiGLE WiFi database.
 *
 * TODO:
 *  - Let password be read from a file. NOTE: Passing your password on the command line makes it visible to all users on your system!
 *
 * [1] https://github.com/t4qjXH8N/ioBroker.google-sharedlocations
 */
const request = require('request');

node_binary = process.argv[0];
this_script = process.argv[1];
arg1_user   = process.argv[2];
arg2_pass   = process.argv[3];

if (isUndefined(arg1_user)) { emitVerbose("Error, missing user argument (Google e-mail account).\n"+"Usage: "+node_binary+" "+this_script+" user pass"); process.exit(5); }
if (isUndefined(arg2_pass)) { emitVerbose("Error, missing pass argument.\n"+                        "Usage: "+node_binary+" "+this_script+" user pass"); process.exit(5); }

// Parameters
const google_username = arg1_user;
const google_password = arg2_pass;
const timeout_sec = 60;

// Internals
var google_fourth_location_url = "";
var google_locator = "google.com";
var google_cookies = {
  "google.com": {
    "GAPS"            : "",
    "GALX"            : "",
    "SID"             : "",
    "LSID"            : "",
    "SIDCC"           : "",
    "HSID"            : "",
    "SSID"            : "",
    "APISID"          : "",
    "SAPISID"         : "",
    "ACCOUNT_CHOOSER" : "",
    "NID"             : "",
    "CONSENT"         : "",
    "1P_JAR"          : ""
  }
};
var google_form = {
  "gxf"                : "",
  "ProfileInformation" : "",
  "SessionState"       : ""
};


main();

function isUndefined(arg) {
  return !(typeof arg !== 'undefined' && arg)
}

function emitVerbose(arg) {
  console.error(arg); // console.trace();
}

function emitOutput(arg) {
  console.log(arg);
}

function emitUsers(users, callback) {
  // Go through all users
  for (var j=0; j < users.length; j++) {
    var u = users[j];
    var userline = [u.unix_time_now, u.id, u.lat, u.long, u.name, u.photoURL].join(' , ')
    emitOutput(userline);
  }

  callback(false); // No error
}

function main() {
  emitVerbose('Starting google shared locations adapter');

  // Make the query
  querySharedLocations(function(err) {
    if (err) {
      emitVerbose("Error");
      process.exit(1);
    } else {
      /* Optionally logout from Google */
      emitVerbose("Done");
      process.exit(0);
    }
  });

  // Kill myself if we could not find the locations before a timeout
  setInterval(function () {
    process.exit(2);
  }, Number(timeout_sec)*1000);
}

// Login, get locations and logout
function querySharedLocations(callback) {
  connectToGoogle(function(err) {
    if (err) {
      if (callback) callback(err);
    } else {
      getSharedLocations(function(err, users) {
        if (err) {
          if (callback) callback(err);
        } else {
          emitUsers(users, function(err) {
            if (callback) callback(err);
          });
        }
      });
    }
  });
}

function connectToGoogle(callback) {
  connectFirstStage(function(err) {
    if (err) {
      emitVerbose('First stage auth error');
      if (callback) callback(err);
    } else {
      connectSecondStage(function(err) {
        if (err) {
          emitVerbose('Second stage (auth user) error');
          if (callback) callback(err);
        } else {
          connectThirdStage(function(err) {
            if (err) {
              emitVerbose('Third stage (auth password) error');
              if (callback) callback(err);
            } else {
              connectFourthStage(function(err) {
                if (err) {
                  emitVerbose('Fourth stage (locator) error');
                  if (callback) callback(err);
                } else {
                  if (callback) callback(false);
                }
              });
            }
          });
        }
      });
    }
  });
}

// Connect to Google, call login page
function connectFirstStage(callback) {
  emitVerbose("First stage, connecting to Google ...");

  // First get GAPS cookie
  var options_connect1 = {
    url: "https://accounts.google.com/ServiceLogin",
    headers: {},
    method: "GET",
    qs: {
      "rip": "1",
      "nojavascript": "1"
    }
  };

  request(options_connect1, function(err, response, body){
    if (err || !response) {
      emitVerbose(err);
      emitVerbose('Connection failure.');
     
      if (callback) callback(true);
    } else {
      emitVerbose('Connection successful. Response: ' + response.statusMessage);      

      if (response.statusCode !== 200) {
        emitVerbose('Connection works, but authorization failure (wrong password?)!');       
        if (callback) callback(true);
      } else {
        // Save cookies etc.
        if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
          // Save gfx value from received form field
          var gxfdom = response.body.match(/<input\s+type="hidden"\s+name="gxf"\s+value="\S*/g);
          google_form['gxf'] = gxfdom[0].split('"')[5];
          saveConnectionCookies(response.headers['set-cookie'], 'google.com');
          emitVerbose('Connection successful. Saved connection cookies.');          
          if (callback) callback(false);
        } else {
          emitVerbose('No cookie found.'); 
         
          if (callback) callback(true);
        }
      }
    }
  });
}

// Connected to Google, now send username (E-Mail address)
function connectSecondStage(callback) {
  emitVerbose("Second stage, sending E-Mail address ..."); 
 
  var username = google_username;

  var options_connect2 = {
    url: "https://accounts.google.com/signin/v1/lookup",
    headers: {
      "Cookie": "GAPS=" + google_cookies['google.com']['GAPS']
    },
    method: "POST",
    form: {
      "Page"                    : "PasswordSeparationSignIn",
      "gxf"                     : google_form['gxf'],
      "rip"                     : "1",
      "ProfileInformation"      : "",
      "SessionState"            : "",
      "bgresponse"              : "js_disabled",
      "pstMsg"                  : "0",
      "checkConnection"         : "",
      "checkedDomains"          : "youtube",
      "Email"                   : username,
      "identifiertoken"         : "",
      "identifiertoken_audio"   : "",
      "identifier-captcha-input": "",
      "signIn"                  : "Weiter",
      "Passwd"                  : "",
      "PersistentCookie"        : "yes"
    }
  };

  request(options_connect2, function(err, response, body){
    if (err || !response) {
      emitVerbose(err); 
      emitVerbose('Connection failure.');      
      if (callback) callback(true);
    } else {
      emitVerbose('Connection successful. Response: ' + response.statusMessage);

      if (response.statusCode !== 200) {
        emitVerbose('Connection works, but authorization failure (wrong password?)!');        
        if (callback) callback(true);
      } else {
        // Save cookies etc.
        if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
          saveConnectionCookies(response.headers['set-cookie'], 'google.com');

          // Extract some information from the form
          var profileinformationdom = response.body.match(/<input\s+id="profile-information"\s+name="ProfileInformation"\s+type="hidden"\s+value="\S*/g);
          google_form['ProfileInformation'] = profileinformationdom[0].split('"')[7];
          var sessionstatedom = response.body.match(/<input\s+id="session-state"\s+name="SessionState"\s+type="hidden"\s+value="\S*/g);
          google_form['SessionState'] = sessionstatedom[0].split('"')[7];

          emitVerbose('Connection successful. Saved connection cookies.');
          if (callback) callback(false);
        } else {
          emitVerbose('No cookie found.');          
          if (callback) callback(true);
        }
      }
    }
  });
}

// Connected to Google, send password
function connectThirdStage(callback) {
  emitVerbose("Third stage, sending password ...");

  var username = google_username;
  var password = google_password;

  var options_connect3 = {
    url: "https://accounts.google.com/signin/challenge/sl/password",
    headers: {
      "Cookie": "GAPS=" + google_cookies['google.com']['GAPS'] + "; " + "GALX=" + google_cookies['google.com']['GALX'],
      "Origin": "https://accounts.google.com",
      "Referer": "https://accounts.google.com/signin/v1/lookup",
      "Upgrade-Insecure-Requests": "1"
    },
    method: "POST",
    form: {
      "Page"               : "PasswordSeparationSignIn",
      "GALX"               : google_cookies['google.com']['GALX'],
      "gxf"                : google_form['gxf'],
      "checkedDomains"     : "youtube",
      "pstMsg"             : "0",
      "rip"                : "1",
      "ProfileInformation" : google_form['ProfileInformation'],
      "SessionState"       : google_form['SessionState'],
      "_utf8"              : "☃",
      "bgresponse"         : "js_disabled",
      "checkConnection"    : "",
      "Email"              : username,
      "signIn"             : "Weiter",
      "Passwd"             : password,
      "PersistentCookie"   : "yes",
      "rmShown"            : "1"
    }
  };

  request(options_connect3, function(err, response, body) {
    if (err || !response) {
      // No connection
      emitVerbose(err); 
      emitVerbose('Connection failure.');      
      if (callback) callback(true);
    } else {
      emitVerbose('Connection successful. Response: ' + response.statusMessage); 
     
      // Connection established but auth failure
      if (response.statusCode !== 302) {
        emitVerbose('Redirector http code 302 expected, but ' + response.statusCode + ' received.'); 
        emitVerbose('Redirector expected, but not received!!');        
        if (callback) callback(true);
      } else {
        // Save cookies etc.
        if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
          saveConnectionCookies(response.headers['set-cookie'], 'google.com');

          // Get location url
          google_fourth_location_url = response.headers.location;
          emitVerbose('Authentication successful, received new location URL: ' + google_fourth_location_url); 
         
          if (callback) callback(false);
        } else {
          emitVerbose('No cookie found.');          
          if (callback) callback(true);
        }
      }
    }
  });
}

// Connected to Google, follow redirector, retrieve cookies from localized pages
function connectFourthStage(callback) {
  emitVerbose('Fourth stage, redirecting to  ' + google_fourth_location_url);

  getCookieHeader('google.com', function(err, cookieheader) {

    var options_connect4 = {
      url: google_fourth_location_url,
      headers: {
        "Cookie": cookieheader
      },
      method: "POST"
    };

    request(options_connect4, function(err, response, body) {
      if (err || !response) {
        emitVerbose(err);
        emitVerbose('Connection failure.');
        if (callback) callback(true);
      } else {
        emitVerbose('Connection successful. Response: ' + response.statusMessage);

        // Connection established but an error occured
        if (response.statusCode !== 302) {
          emitVerbose('Removed cookies.');
          emitVerbose('Connection works, but authorization failure (wrong password?)!');
          if (callback) callback(true);
        } else {
          // Save cookies etc.
          if (response.hasOwnProperty('headers') && response.headers.hasOwnProperty('set-cookie')) {
            saveConnectionCookies(response.headers['set-cookie'], 'google.com');
            emitVerbose('Connection successful. Saved connection cookies.');
            if (callback) callback(false);
          } else {
            emitVerbose('No cookie found.');
            if (callback) callback(true);
          }
        }
      }
    });
  });
}

// Query google shared locations
function getSharedLocations(callback) {
  getCookieHeader('google.com', function(err, cookieheader) {
    var options_map = {
      url: "https://www.google.com/maps/preview/locationsharing/read",
      headers: {
        "Cookie": cookieheader
      },
      method: "GET",
      qs: {
        "authuser": 0,
        "pb": ""
      }
    };

    request(options_map, function(err, response, body) {
      if (err || !response) {
        emitVerbose('Connection to google maps failure.'); 
        if (callback) callback(true);
      } else {
        emitVerbose('Connection successful. Response: ' + response.statusMessage); 
        if (response.statusCode !== 200) {
          emitVerbose('Connection successful, but authorization failure (wrong password?)!'); 
          if (callback) callback(true);
        } else {
          emitVerbose('Connection successful, and authorization OK.'); 
          // Parse and save user locations
          var locationdata = JSON.parse(body.split('\n').slice(1, -1).join(''));
          parseLocationData(locationdata, function(err, users) {
            if (err) {
              if (callback) callback(err);
            } else {
              if (callback) callback(false, users);
            }
          });
        }
      }
    });
  });
}

// Logout from google
function logout(callback) {
  getCookieHeader('google.com', function(err, cookieheader) {
    emitVerbose('Logout attempt.');
    emitVerbose('Current cookie : ' + cookieheader);
    var options_map = {
      url: "https://accounts.google.com/logout",
      headers: {
        "Cookie": cookieheader
      },
      method: "GET"
    };

    request(options_map, function(err, response, body){
      if (err || !response) {
        emitVerbose('Disconnect from google failed.');
        if (callback) callback(true);
      } else {
        emitVerbose('Connection successful. Response: ' + response.statusMessage);
        if (response.statusCode !== 200) {
          emitVerbose('Connection established but auth failure: HTTP error (not 200).');
          if (callback) callback(true);
        } else {
          emitVerbose('Logout from google.');
        }
      }
    });
  });
}

// Compose the header cookie data
function getCookieHeader(domain, callback) {
  var cookiestr = '';
  for (var curcookie in google_cookies[domain]) {
    cookiestr = cookiestr + curcookie + '=' + google_cookies[domain][curcookie] + ';'
  }
  callback(false, cookiestr.slice(0, -1));
}

// Save cookies from google
function saveConnectionCookies(setcookies, domain) {
  for (var i=0; i<setcookies.length;i++) {
    var key = setcookies[i].split(';')[0].split('=')[0];
    var val = setcookies[i].split(';')[0].split('=')[1];

    if (google_cookies[domain].hasOwnProperty(key)) {
      google_cookies[domain][key] = val;
    }
  }
}

// Parse the retrieved location data
function parseLocationData(locationdata, callback) {
  // Shared location data is contained in the first element
  var perlocarr = locationdata[0];

  if (perlocarr && perlocarr.length > 0) {
    var userdataobjarr = [];

    for (var i=0; i<perlocarr.length;i++) {
      extractUserLocationData(perlocarr[i], function(err, obj) {
        if (err) {
          if (callback) callback(err);
        } else {
          userdataobjarr[i] = obj;
        }
      });
    }

    if (callback) callback(false, userdataobjarr);
  } else {
    if (callback) callback(false);
  }
}

// Get user date and create states form
function extractUserLocationData(userdata, callback) {
  var userdataobj = {
    "unix_time_now" : Math.floor(new Date()/1000),
    "id"            : userdata[0][0],
    "photoURL"      : userdata[0][1],
    "name"          : userdata[0][3],
    "lat"           : userdata[1][1][2],
    "long"          : userdata[1][1][1]
  };

  if (callback) callback(false, userdataobj);
}

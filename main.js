const   https = require('https'),
        zlib = require('zlib'),
        fs = require('fs'),
        env = process.env;

function fail(message, exitCode=1) {
    console.log(`::error::${message}`);
    process.exit(1);
}

function semverCompare(v1, v2, options) {
    var lexicographical = options && options.lexicographical,
        zeroExtend = options && options.zeroExtend,
        v1parts = v1.split('.'),
        v2parts = v2.split('.');

    function isValidPart(x) {
        return (lexicographical ? /^\d+[A-Za-z]*$/ : /^\d+$/).test(x);
    }

    if (!v1parts.every(isValidPart) || !v2parts.every(isValidPart)) {
        return NaN;
    }

    if (zeroExtend) {
        while (v1parts.length < v2parts.length) v1parts.push("0");
        while (v2parts.length < v1parts.length) v2parts.push("0");
    }

    if (!lexicographical) {
        v1parts = v1parts.map(Number);
        v2parts = v2parts.map(Number);
    }

    for (var i = 0; i < v1parts.length; ++i) {
        if (v2parts.length == i) {
            return 1;
        }

        if (v1parts[i] == v2parts[i]) {
            continue;
        }
        else if (v1parts[i] > v2parts[i]) {
            return 1;
        }
        else {
            return -1;
        }
    }

    if (v1parts.length != v2parts.length) {
        return -1;
    }

    return 0;
}

function request(method, path, data, callback) {
    
    try {
        if (data) {
            data = JSON.stringify(data);
        }  
        const options = {
            hostname: 'api.github.com',
            port: 443,
            path,
            method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data ? data.length : 0,
                'Accept-Encoding' : 'gzip',
                'Authorization' : `token ${env.INPUT_TOKEN}`,
                'User-Agent' : 'GitHub Action - development'
            }
        }
        const req = https.request(options, res => {
    
            let chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => {
                let buffer = Buffer.concat(chunks);
                if (res.headers['content-encoding'] === 'gzip') {
                    zlib.gunzip(buffer, (err, decoded) => {
                        if (err) {
                            callback(err);
                        } else {
                            callback(null, res.statusCode, decoded && JSON.parse(decoded));
                        }
                    });
                } else {
                    callback(null, res.statusCode, buffer.length > 0 ? JSON.parse(buffer) : null);
                }
            });
    
            req.on('error', err => callback(err));
        });
    
        if (data) {
            req.write(data);
        }
        req.end();
    } catch(err) {
        callback(err);
    }
}


function main() {

    const path = 'BUILD_NUMBER/BUILD_NUMBER';
    const prefix = env.INPUT_PREFIX ? `${env.INPUT_PREFIX}-` : '';

    if (fs.existsSync(path)) {
        let buildNumber = fs.readFileSync(path);
        console.log(`Build number already generated in earlier jobs, using build number ${buildNumber}...`);
        fs.writeFileSync(process.env.GITHUB_ENV, `BUILD_NUMBER=${buildNumber}`);
        console.log(`::set-output name=build_number::${buildNumber}`);
        return;
    }
    
    //Some sanity checking:
    for (let varName of ['INPUT_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_SHA']) {
        if (!env[varName]) {
            fail(`ERROR: Environment variable ${varName} is not defined.`);
        }
    }

    request('GET', `/repos/${env.GITHUB_REPOSITORY}/git/refs/tags/${prefix}staging-version-`, null, (err, status, result) => {
    
        let nextBuildNumber, nextVersionNumber, nrTags, currentBuildNumber, currentVersionNumber;
    
        if (status === 404) {
            console.log('No staging-version ref available, starting at 2.0.0 (1).');
            nextBuildNumber = 1;
            nextVersionNumber = "2.0.0";
            nrTags = [];
        } else if (status === 200) {
            const regexString = `/${prefix}staging-version-(\\d+\\.)?(\\d+\\.)?(\\*|\\d+)-(\\d+)$`;
            const regex = new RegExp(regexString);
            nrTags = result.filter(d => d.ref.match(regex));
            console.log(nrTags);

            const MAX_OLD_NUMBERS = 50;
            if (nrTags.length > MAX_OLD_NUMBERS) {
                fail(`ERROR: Too many ${prefix}staging-version- refs in repository, found ${nrTags.length}, expected only 1. There is something wrong.`);
            }

            let version = nrTags.map(t => t.ref.match(/\d+\.\d+\.\d+/)[0]);
            let nrs = nrTags.map(t => parseInt(t.ref.match(/-(\d+)$/)[1]));

            if(nrTags.length === 2) {
                currentBuildNumber = nrs[1];
                currentVersionNumber = version[1];
            } 
            else {
                currentBuildNumber = nrs[0];
                currentVersionNumber = version[0];
            }

            if(currentBuildNumber === undefined) {
                currentBuildNumber = Math.max(...nrs);
            }

          
            console.log(`Last build was ${currentVersionNumber} (${currentBuildNumber}).`);

            const [major, minor, patch] = currentVersionNumber.split(".");
            console.log(env.build_number_reinit);
            console.log(env.build_number_reinit=='true');
            if(env.build_number_reinit == 'true') {
                console.log("reinitialisation build number : ok")
                nextBuildNumber = 1;
            } else {
                nextBuildNumber = currentBuildNumber + 1;
            }

            console.log("Increment type is -> "+env.increment)
            switch (env.increment) {
                case "bug":
                    nextVersionNumber = parseInt(major)+"."+parseInt(minor)+"."+(parseInt(
                    patch)+1);
                    break;  
                case "patch":
                    nextVersionNumber = parseInt(major)+"."+parseInt(minor)+"."+(parseInt(
                    patch)+1);
                    break
                case "minor":
                    nextVersionNumber = parseInt(major)+"."+(parseInt(minor)+1)+".0";
                    break;   
                case "feature":
                    nextVersionNumber = parseInt(major)+"."+(parseInt(minor)+1)+".0";
                    break;
                case "major":
                    nextVersionNumber = (parseInt(major)+1)+".0.0";
                    break;
                case "no change":
                    nextVersionNumber = currentVersionNumber;
                    nextBuildNumber = currentBuildNumber;
                    break;
                default:
                    nextVersionNumber = currentVersionNumber;
                    nextBuildNumber = currentBuildNumber + 1; 
                    break;
            }
            
            console.log(`Updating build to ${nextVersionNumber} (${nextBuildNumber})...`);
        } else {
            if (err) {
                fail(`Failed to get refs. Error: ${err}, status: ${status}`);
            } else {
                fail(`Getting staging-version refs failed with http status ${status}, error: ${JSON.stringify(result)}`);
            } 
        }
        
        if(env.increment !== "no change") {
            let newRefData = {
                ref:`refs/tags/${prefix}staging-version-${nextVersionNumber}-${nextBuildNumber}`, 
                sha: env.GITHUB_SHA
            };
            request('POST', `/repos/${env.GITHUB_REPOSITORY}/git/refs`, newRefData, (err, status, result) => {
                if (status !== 201 || err) {
                    fail(`Failed to create new staging-version ref. Status: ${status}, err: ${err}, result: ${JSON.stringify(result)}`);
                }
    
                console.log(`Successfully updated version to ${nextVersionNumber} (${nextBuildNumber})`);
    
                //Setting the output and a environment variable to new build number and version number...
                fs.writeFileSync(process.env.GITHUB_ENV, `BUILD_NUMBER=${nextBuildNumber}`);
    
                console.log(nextBuildNumber);
    
                fs.writeFileSync(process.env.GITHUB_ENV, `VERSION_NUMBER=${nextVersionNumber}`);
    
                console.log(nextVersionNumber);
    
                fs.writeFileSync(process.env.GITHUB_ENV, `TAG_LABEL=${prefix}staging-version-${nextVersionNumber}-${nextBuildNumber}`);
    
                console.log(`${prefix}staging-version-${nextVersionNumber}-${nextBuildNumber}`);
    
                console.log(`::set-output name=build_number::${nextBuildNumber}`);
                console.log(`::set-output name=version_number::${nextVersionNumber}`);
                console.log(`::set-output name=tag_label::${prefix}staging-version-${nextVersionNumber}-${nextBuildNumber}`);
                console.log(`::set-output name=old_tag_label::${prefix}staging-version-${currentVersionNumber}-${currentBuildNumber}`);

                fs.writeFileSync('BUILD_NUMBER', nextBuildNumber.toString());
                fs.writeFileSync('VERSION_NUMBER', nextVersionNumber.toString());
                fs.writeFileSync('TAG_LABEL', `${prefix}staging-version-${nextVersionNumber}-${nextBuildNumber}`);
                fs.writeFileSync('OLD_TAG_LABEL', `${prefix}staging-version-${currentVersionNumber}-${currentBuildNumber}`);

                //Cleanup
                if (nrTags) {
                    console.log(`Deleting ${nrTags.length} older build counters...`);
                    for (let nrTag of nrTags) {
                        if(nrTag.ref !== `refs/tags/${prefix}staging-version-${currentVersionNumber}-${currentBuildNumber}`) {
                            request('DELETE', `/repos/${env.GITHUB_REPOSITORY}/git/${nrTag.ref}`, null, (err, status, result) => {
                                if (status !== 204 || err) {
                                    console.warn(`Failed to delete ref ${nrTag.ref}, status: ${status}, err: ${err}, result: ${JSON.stringify(result)}`);
                                } else {
                                    console.log(`Deleted ${nrTag.ref}`);
                                }
                            });
                        }
                    }
                }
    
            });
        } else {
            fs.writeFileSync(process.env.GITHUB_ENV, `BUILD_NUMBER=${nextBuildNumber}`);    
            fs.writeFileSync(process.env.GITHUB_ENV, `VERSION_NUMBER=${nextVersionNumber}`);    
            fs.writeFileSync(process.env.GITHUB_ENV, `TAG_LABEL=${prefix}staging-version-${nextVersionNumber}-${nextBuildNumber}`);
            fs.writeFileSync(process.env.GITHUB_ENV, `OLD_TAG_LABEL=${prefix}staging-version-${currentVersionNumber}-${currentBuildNumber}`);

            console.log(`::set-output name=old_tag_label::${prefix}staging-version-${currentVersionNumber}-${currentBuildNumber}`);
            console.log(`::set-output name=build_number::${nextBuildNumber}`);
            console.log(`::set-output name=version_number::${nextVersionNumber}`);
            console.log(`::set-output name=tag_label::${prefix}staging-version-${nextVersionNumber}-${nextBuildNumber}`);
        }
    });
}

main();




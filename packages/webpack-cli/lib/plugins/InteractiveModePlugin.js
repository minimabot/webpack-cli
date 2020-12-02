const readline = require('readline');
const { version } = require('webpack');
const { red, green, cyanBright, bold } = require('colorette');

/**
 * Displays command space at bottom of screen
 * @param {string} msg message to print with command
 * @param {boolean} status currently watching or not
 */
const spawnCommand = (msg, status) => {
    const lines = 3;
    const totalRows = process.stdout.rows;
    readline.cursorTo(process.stdout, 0, totalRows - lines);
    readline.clearScreenDown(process.stdout);

    console.log(bold(cyanBright(`ⓘ  ${msg}`)));
    process.stdout.write('\n');

    readline.cursorTo(process.stdout, 0, totalRows - 2);

    // for current status
    if (status) {
        process.stdout.write(`${green('⬤')}  `);
    } else {
        process.stdout.write(`${red('⬤')}  `);
    }
};

/**
 * Clear the whole terminal
 */
const clrscr = () => {
    process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
};

/**
 * Helper plugin for child compilers if MultiCompiler is supplied
 */
class InteractiveModeMultiCompilerHelperPlugin {
    constructor() {
        this.name = 'InteractiveModeMultiCompilerHelperPlugin';
    }

    apply(compiler) {
        // clear terminal if any one of child starts compilation
        compiler.hooks.beforeCompile.tap(this.name, () => {
            clrscr();
        });
    }
}

/**
 * Interactive Mode plugin
 */
class InteractiveModePlugin {
    constructor() {
        this.isMultiCompiler = false;
        this.compilers = undefined;
        this.name = 'InteractiveModePlugin';
        this.keys = {
            quit: 'q',
            stop: 's',
            start: 'w',
        };
        this.handlers = {
            quit: this.quitHandler.bind(this),
            stop: this.stopHandler.bind(this),
            start: this.startHandler.bind(this),
        };
    }

    apply(compiler) {
        // Configure stdin for keypress event
        const stdin = process.stdin;
        stdin.setEncoding('utf-8');
        readline.emitKeypressEvents(stdin);

        // Configure keypress event for actions
        const actions = Object.keys(this.keys);
        stdin.on('keypress', (_, actionKey) => {
            const possibleActions = actions.filter((action) => {
                return this.keys[action] === actionKey.name;
            });

            if (possibleActions.length === 0) {
                return;
            }

            if (possibleActions.length > 1) {
                throw new Error('Multiple actions are provided for same key');
            }

            const action = possibleActions[0];
            this.handlers[action](compiler);
        });

        if (compiler.compilers) {
            this.isMultiCompiler = true;
            this.compilers = compiler.compilers;
        }

        // Clear for first run as well
        clrscr();

        if (!this.isMultiCompiler) {
            // Clear output on watch invalidate
            compiler.hooks.beforeCompile.tap(this.name, () => {
                clrscr();
            });

            if (version.startsWith('5')) {
                compiler.hooks.afterDone.tap(this.name, () => {
                    setTimeout(() => {
                        console.log('\n\n');
                        spawnCommand('compilation completed', true);
                    }, 1);
                });
            } else {
                compiler.hooks.done.tap(this.name, () => {
                    setTimeout(() => {
                        console.log('\n\n');
                        spawnCommand('compilation completed', true);
                    }, 100);
                });
            }
        } else {
            const helperPlugin = new InteractiveModeMultiCompilerHelperPlugin();

            // Register helper plugin on each of child compiler
            for (const childCompiler of this.compilers) {
                helperPlugin.apply(childCompiler);
            }

            compiler.hooks.done.tap(this.name, () => {
                const allDone = this.compilers.reduce((result, childCompiler) => {
                    return result && !childCompiler.watching.running;
                }, true);

                if (!allDone) return;

                setTimeout(() => {
                    console.log('\n\n');
                    spawnCommand('all compilations completed', true);
                }, 100);
            });
        }
    }

    quitHandler(compiler) {
        if (version.startsWith(5)) {
            if (this.isMultiCompiler) {
                for (const childCompiler of this.compilers) {
                    if (childCompiler.watching === undefined) continue;
                    childCompiler.watching.close();
                }
                process.exit(0);
            }

            if (compiler.watching === undefined) return;
            compiler.watching.close(() => {
                process.exit(0);
            });
            return;
        }
        process.exit(0);
    }

    startHandler(compiler) {
        if (!version.startsWith('5')) {
            spawnCommand('starting not supported', true);
            return;
        }

        if (this.isMultiCompiler) {
            const allWatching = this.compilers.reduce((result, childCompiler) => {
                return result && !childCompiler.watching.suspended;
            }, true);

            if (allWatching) {
                spawnCommand('all already watching', true);
                return;
            }

            clrscr();
            for (const childCompiler of this.compilers) {
                if (childCompiler.watching && childCompiler.watching.suspended) {
                    childCompiler.watching.resume();
                }
            }
            return;
        }

        if (!compiler.watching.suspended) {
            spawnCommand('already watching', true);
            return;
        }

        clrscr();
        compiler.watching.resume();
    }

    stopHandler(compiler) {
        if (!version.startsWith('5')) {
            spawnCommand('stoping not supported', true);
            return;
        }

        if (this.isMultiCompiler) {
            const allSuspended = this.compilers.reduce((result, childCompiler) => {
                return result && childCompiler.watching.suspended;
            }, true);

            if (allSuspended) {
                spawnCommand('all already stoped', true);
                return;
            }

            for (const childCompiler of this.compilers) {
                if (!childCompiler.watching.suspended) {
                    childCompiler.watching.suspend();
                }
            }
            spawnCommand('all stoped watching', false);
            return;
        }

        if (compiler.watching.suspended) {
            spawnCommand('already stoped', false);
            return;
        }

        compiler.watching.suspend();
        spawnCommand('stoped watching', false);
    }
}
module.exports = InteractiveModePlugin;
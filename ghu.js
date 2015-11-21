const {resolve, join} = require('path');
const dateformat = require('dateformat');
const {
    default: ghu,
    autoprefixer, hash, jade, jszip, less, mapfn, read, remove, run, uglify,
    watch, webpack, wrap, write
} = require('ghu');

const ROOT = resolve(__dirname);
const LIB = join(ROOT, 'lib');
const BUILD = join(ROOT, 'build');
const TEST = join(ROOT, 'test');
const DIST = join(ROOT, 'dist');
const COVERAGE = join(ROOT, 'coverage');

ghu.defaults('release');

ghu.before(runtime => {
    runtime.pkg = Object.assign({}, require('./package.json'));
    runtime.stamp = dateformat(Date.now(), 'yyyy-mm-dd-HH-MM-ss');
    runtime.hash = hash.string(runtime.stamp);

    const res = run.sync(`git rev-list v${runtime.pkg.version}..HEAD`, {silent: true});
    if (res.code === 0) {
        const hashes = res.stdout.split(/\r?\n/).filter(x => x);
        if (hashes.length) {
            const counter = hashes.length;
            const githash = hashes[0].substr(0, 7);
            runtime.pkg.version += `+${counter}~${githash}~${runtime.stamp}`;
        }
    }

    runtime.comment = `${runtime.pkg.name} v${runtime.pkg.version} - © Lars Jung`;
    runtime.commentJs = `/* ${runtime.comment} */\n`;
    runtime.commentHtml = `<!-- ${runtime.comment} -->`;

    console.log(runtime.comment);
});

ghu.task('clean', 'delete build folder', () => {
    return remove(`${BUILD}, ${DIST}, ${COVERAGE}`);
});

ghu.task('lint', () => {
    return run('eslint .', {stdio: 'inherit'});
});

ghu.task('build:scripts', runtime => {
    const webpackConfig = {
        output: {},
        module: {
            loaders: [
                {
                    include: [LIB],
                    loader: 'babel',
                    query: {cacheDirectory: true}
                }
            ]
        }
    };

    if (!runtime.args.production) {
        webpackConfig.output.pathinfo = true;
        webpackConfig.devtool = '#inline-source-map';
    }

    return read(`${LIB}/index.js`)
        .then(webpack(webpackConfig, {showStats: false}))
        .then(wrap(runtime.commentJs))
        .then(write(`${DIST}/lo.js`, {overwrite: true}))
        .then(write(`${BUILD}/lo-${runtime.pkg.version}.js`, {overwrite: true}))
        .then(uglify({compressor: {warnings: false}}))
        .then(wrap(runtime.commentJs))
        .then(write(`${DIST}/lo.min.js`, {overwrite: true}))
        .then(write(`${BUILD}/lo-${runtime.pkg.version}.min.js`, {overwrite: true}));
});

ghu.task('build:copy', () => {
    return read(`${ROOT}/*.md`)
        .then(write(mapfn.p(ROOT, BUILD), {overwrite: true}));
});

ghu.task('build:test', runtime => {
    const webpackConfig = {
        output: {
            pathinfo: true
        },
        module: {
            loaders: [
                {
                    include: [LIB, TEST],
                    loader: 'babel',
                    query: {cacheDirectory: true}
                }
            ]
        },
        devtool: '#inline-source-map'
    };

    return Promise.all([
        read(`${ROOT}/node_modules/mocha/mocha.js`)
            .then(write(`${BUILD}/test/mocha.js`, {overwrite: true})),

        read(`${TEST}/runner/styles.less`)
            .then(less())
            .then(autoprefixer())
            .then(write(`${BUILD}/test/styles.css`, {overwrite: true})),

        read(`${TEST}/runner/index.html.jade`)
            .then(jade({pkg: runtime.pkg}))
            .then(write(`${BUILD}/test/index.html`, {overwrite: true})),

        read(`${TEST}/runner/scripts.js`)
            .then(webpack(webpackConfig, {showStats: false}))
            .then(write(`${BUILD}/test/scripts.js`, {overwrite: true}))
    ]).then(() => console.log(`browse to ${BUILD}/test/index.html`));
});

ghu.task('build', ['build:scripts', 'build:copy', 'build:test']);

ghu.task('zip', ['build'], runtime => {
    return read(`${BUILD}/*`)
        .then(jszip({dir: BUILD, level: 9}))
        .then(write(`${BUILD}/lo-${runtime.pkg.version}.zip`, {overwrite: true}));
});

ghu.task('release', ['clean', 'zip']);

ghu.task('stats', () => {
    return run(`local/size.sh`, {stdio: 'inherit'});
});

ghu.task('watch', ['clean', 'build'], runtime => {
    return watch([LIB, TEST], () => ghu.run(['build'], runtime.args, true));
});
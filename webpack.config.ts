import * as path from "path";

module.exports = {
    entry: "./src/index.ts",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "index.js",
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        modules: [ "./node_modules" ],
        extensions: [".ts", ".js"],
        alias: {
            "@utils/*": path.resolve(__dirname, "./src/utils/*"),
            "@services/*": path.resolve(__dirname, "./src/services/*")
        },
    },
    target: "node",
    mode: "production",
    node: false,
};

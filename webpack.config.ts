import * as path from "path";
import * as webpack from "webpack";

module.exports = {
    target: "node",
    mode: "production",
    node: false,
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
    plugins: [
        new webpack.optimize.LimitChunkCountPlugin({
            maxChunks: 1 // keep it to one file
        }),
    ],
};

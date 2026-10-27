import { readFile, readdir, writeFile } from "node:fs/promises";
import JSZip from "jszip";
const zip=new JSZip();
async function add(dir,prefix=""){
    for(const entry of await readdir(dir,{withFileTypes:true})){
        if(entry.isDirectory())await add(dir+"/"+entry.name,prefix+entry.name+"/");
        else zip.file(prefix+entry.name,await readFile(dir+"/"+entry.name));
    }
}
await add("dev");
const manifest=JSON.parse(await zip.file("plugin.json").async("string"));
const packageInfo=JSON.parse(await readFile("package.json","utf8"));
if(manifest.version!==packageInfo.version)throw Error("版本号不一致");
for(const name of [manifest.preview,"index.js","index.css","README.md","RELEASE_NOTES.md","LICENSE"]){if(!zip.file(name))throw Error("缺少安装包资源："+name);}
await writeFile("package.zip",await zip.generateAsync({type:"nodebuffer",compression:"DEFLATE"}));
console.log(JSON.stringify({version:manifest.version,files:Object.keys(zip.files).length}));

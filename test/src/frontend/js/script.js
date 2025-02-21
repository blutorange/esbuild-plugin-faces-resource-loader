import icon from "../image/icon.png";
import icon2 from "../image/icon2.png";
import icon3 from "../image/icon3.svg";

function helloWorld() {
    return "hello world";
}

function render() {
    const html = [
        `<img src=${icon}></img>`,
        `<img src=${icon2}></img>`,
        `<img src=${icon3}></img>`,
    ];
    return html.join("");
}

console.log(helloWorld());
console.log(render());
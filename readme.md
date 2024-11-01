# Reactive Why The Hell Not (WTHN)

Reactive WTHN is a JavaScript set of instructions and DOM renderer that will only change the absolute finest node in a batch scheduler. This is currently a small prototype demonstrating how we can create a lightweight and fine-grained set of instructions for rendering.

This repository will initially feature branches for each stage of the development of a framework with custom authoring. The master branch serves as the baseline we need. Reactive WTHN UI is based on instructions for building our elements, with the DOM renderer responsible for the actual display.

## Why Use an Instruction-Based Approach?

The concept of instructions allows us to showcase different authoring styles and enables any framework to be extendable while remaining compatible with each authoring method at runtime. It also helps to limit the JSX approach, which can constrain you to that specific syntax.

## Why Not Just Use a Renderer?

Modern applications are increasingly designed for the web, mobile, and native environments. In our case, the authoring will be compiled into our instructions, allowing us to have a renderer tailored for each platform we are targeting, thus enhancing flexibility.
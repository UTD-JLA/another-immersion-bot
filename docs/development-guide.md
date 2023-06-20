# Development Guide
This is meant to act as an introduction into how this project is setup for anyone who wished to contribute.

## Requirements
1. Node.js >= 16.9.0
2. Python3
3. yt-dl
4. MongoDB instance to connect to

## Recommendations
Install Node.js with NVM and use the version specified in `.nvmrc`.

You can create a free MongoDB instance to connect to for testing on [MongoDB Atlas](https://www.mongodb.com/atlas/database).

Make sure you are making use of linting. [ESLint for VSCode](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

## Important Reference Materials
This stuff is important to the project.
1. [Discord.js docs](https://discord.js.org/)
2. [Mongoose docs](https://mongoosejs.com/docs/)
3. [Inversify docs](https://inversify.io/)
4. [The Typescript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)

## Less Important Materials
This stuff isn't used much or is meant more for beginners.
1. [Introduction to Node.js](https://nodejs.dev/en/learn/introduction-to-nodejs/)
2. [Matplotlib User Guide](https://matplotlib.org/stable/users/index.html)

## Creating Commands
All command files can be found in [src/commands](src/commands/).
All commands should be use the @injectable decorator and be re-exported in [the index.ts file](src/commands/index.ts).
Use `npm run new-cmd commandName` to quickly create a new file. Commands should implement `ICommand` as follows:
```ts
export interface ICommand {
  readonly data: SlashCommandBuilder;
  readonly execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  readonly autocomplete?: (
    interaction: AutocompleteInteraction
  ) => Promise<void>;
}
```

## Creating Services
Creating and using a service takes 4 steps:
1. Create the interface
2. Implement the survice
3. Register and export the service
4. Inject the serivce

#### 1. Creating an interface
All of the interfaces can be found in [src/services/interfaces.ts](src/services/interfaces.ts). Let's create an example CatImageService that gets pictures of cats

First in the interfaces file:
```ts
export interface ICatImageService {
  getRandom(): Promise<Buffer>;
  getByColor(color: Color): Promise<Buffer>;
  getMultiple(amount: number): Promise<Buffer[]>;
}
```

#### 2. Writing the implementation
Next in impl/catService.ts

```ts
@injectable
export default class CatImageService implements ICatImageService {
  private static readonly _CAT_API_URL = "https://www.catimages.gov.uk";

  public async getRandom(): Promise<Buffer> {
    ...
  }
  ...
}
```

#### 3. Register and export
Then in [src/services/index.ts](src/services/index.ts) import both your interface and the implementation. Bind your implementation
in the `registerServices` function body as such:

```ts
export function registerServices(container: Container) {
  ...
  container.bind<ICatImageService>('CatImageService').to(CatImageService);
}
```

By default, services are singletons, this behavior can be changed. For example, by using `.inTransientScope()`, which
means that a new instance of the service is constructed each time it is injected, as opposed to haveing a single shared
instance. View more details in the [inversify docs](https://inversify.io/).

Next, add your service interface to the export at the bottom of the file so that it can be more easily imported elsewhere.

```ts
export {
  ...
  // Our new service
  ICatImageService,
};
```
#### 4. Inject
Now you can use this service in all of your commands.

```ts
@injectable
export default CatImageCommand implements ICommand {
  constructor(@inject('CatImageService') private readonly _catImagesService) {}
  ...
}


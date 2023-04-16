import * as vscode from "vscode";
import * as cp from "child_process";
import * as fs from "fs";
import * as util from "util";

const testpitExecutablePath =
  '"C:\\Program Files (x86)\\TestPit\\Tools\\bin\\TestPit.exe"';
let isUpdating = false;
const updateInterval = 500; // milliseconds
const diagnosticCollections = new Map<string, vscode.DiagnosticCollection>();

export function activate(context: vscode.ExtensionContext) {
  console.log(
    'Congratulations, your extension "esi Helper for TestPit" is now active!'
  );

  const disposable2 = vscode.commands.registerCommand(
    "extension.openWithTestPit",
    async () => {
      const currentlyOpenTabfilePath =
        vscode.window.activeTextEditor?.document.uri.fsPath;
      cp.exec(testpitExecutablePath + " --ow=" + currentlyOpenTabfilePath);
    }
  );
  class OutputChannel {
    private static instance: vscode.OutputChannel;

    public static getInstance(): vscode.OutputChannel {
      if (!OutputChannel.instance) {
        OutputChannel.instance =
          vscode.window.createOutputChannel("esi Helper");
      }
      return OutputChannel.instance;
    }
  }
  const disposable6 = vscode.commands.registerCommand(
    "extension.runValidityCheck",
    async () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        return;
      }

      // create a temporary file with a unique filename
      const tempFilePath = editor.document.uri.fsPath + ".temp";
      fs.writeFileSync(tempFilePath, editor.document.getText());

      // Add new diagnostics to the collection
      const diagnosticList: vscode.Diagnostic[] = [];

      const config = vscode.workspace.getConfiguration();
      const testpitConfigFolderpath = config.get(
        "esihelper.testpitConfigFolderpath"
      );

      const validityOutput = cp
        .execSync(
          testpitExecutablePath +
            " --cf=" +
            testpitConfigFolderpath +
            "MessageConfig_RNESystemTestCable" +
            " --ac=" +
            testpitConfigFolderpath +
            "A429MessageFields.xml" +
            " --mc=" +
            testpitConfigFolderpath +
            "1553MessageFields.xml" +
            " --dc=" +
            testpitConfigFolderpath +
            "DiscreteSignals.xml" +
            " --pc=" +
            testpitConfigFolderpath +
            "MemoryPorts.xml" +
            " --sf=" +
            tempFilePath +
            " --validateScriptOnly=true"
        )
        .toString();
      fs.unlinkSync(tempFilePath);

      // print a message to the output channel
      OutputChannel.getInstance().clear();
      OutputChannel.getInstance().appendLine(validityOutput);
      OutputChannel.getInstance().show(true);
    }
  );

  vscode.workspace.onDidChangeTextDocument(async (event) => {
    if (isUpdating) {
      return;
    }
    isUpdating = true;
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const uri = editor.document.uri;
      let diagnosticCollection = diagnosticCollections.get(uri.toString());
      if (!diagnosticCollection) {
        diagnosticCollection = vscode.languages.createDiagnosticCollection(
          uri.toString()
        );
        diagnosticCollections.set(uri.toString(), diagnosticCollection);
      }
      diagnosticCollection.clear();

      const testpitConfigFolderpath = vscode.workspace
        .getConfiguration()
        .get("esihelper.testpitConfigFolderpath");

      // create a temporary file with a unique filename
      const tempFilePath = editor.document.uri.fsPath + ".temp";
      fs.writeFileSync(tempFilePath, editor.document.getText());

      const validityOutput = await executeTestpitValidity(
        tempFilePath,
        testpitExecutablePath,
        testpitConfigFolderpath
      );

      const diagnostics = parseValidtyOutput(validityOutput, editor);
      fs.unlinkSync(tempFilePath);

      diagnosticCollection.set(uri, diagnostics);
    } catch (err) {
      console.error(err);
    } finally {
      isUpdating = false;
    }
  });

  async function executeTestpitValidity(
    FilePath: fs.PathLike,
    testpitExecutablePath: string,
    testpitConfigFolderpath: unknown
  ) {
    const command = `${testpitExecutablePath} --cf=${testpitConfigFolderpath}MessageConfig_RNESystemTestCable --ac=${testpitConfigFolderpath}A429MessageFields.xml --mc=${testpitConfigFolderpath}1553MessageFields.xml --dc=${testpitConfigFolderpath}DiscreteSignals.xml --pc=${testpitConfigFolderpath}MemoryPorts.xml --sf=${FilePath} --validateScriptOnly=true`;
    const validityOutput = await util.promisify(cp.exec)(command);
    return validityOutput.stdout.toString();
  }

  function parseValidtyOutput(
    validityOutput: string,
    editor: vscode.TextEditor
  ) {
    const diagnostics = [];
    const lines = validityOutput.split("\n");
    for (const line of lines) {
      const regexMatch = line.match(
        /\[(Fatal|Error|Warn.)\] (Line:)?\s*(\d+)?/
      );
      if (regexMatch) {
        const type = regexMatch[1];
        const lineNumber = parseInt(regexMatch[3]) - 1;
        const lineText = editor.document.lineAt(lineNumber).text;
        const firstNonSpaceCharIndex = lineText.search(/\S|$/);
        const range = new vscode.Range(
          lineNumber,
          firstNonSpaceCharIndex,
          lineNumber,
          lineText.trimEnd().length
        );
        const message = line.substring(9).trim();
        const severity =
          type === "Warn."
            ? vscode.DiagnosticSeverity.Warning
            : vscode.DiagnosticSeverity.Error;
        const diagnostic = new vscode.Diagnostic(range, message, severity);
        diagnostics.push(diagnostic);
      }
    }
    return diagnostics;
  }

  const disposable3 = vscode.commands.registerCommand(
    "extension.updateStepNumbers",
    updateStepNumbers
  );

  async function updateStepNumbers() {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      return;
    }

    const fullText = editor.document.getText();
    const firstLine = editor.document.lineAt(0);
    const lastLine = editor.document.lineAt(editor.document.lineCount - 1);
    const textRange = new vscode.Range(
      firstLine.range.start,
      lastLine.range.end
    );

    let targetText = fullText.replace(/\[STEP \d+\]/g, "[STEP XX]");
    const stepCount = (fullText.match(/\[STEP \d+\]/g) || []).length;

    for (let i = 0; i < stepCount; i++) {
      targetText = targetText.replace("[STEP XX]", function () {
        const number = (i + 1) * 10;
        return `[STEP ${number}]`;
      });
    }

    targetText = targetText.replace(/\[\/STEP \d+\]/g, "[/STEP XX]");

    for (let i = 0; i < stepCount; i++) {
      targetText = targetText.replace("[/STEP XX]", function () {
        const number = (i + 1) * 10;
        return `[/STEP ${number}]`;
      });
    }

    editor.edit((editBuilder) => {
      editBuilder.replace(textRange, targetText);
    });
  }

  const disposable4 = vscode.commands.registerCommand(
    "extension.gotoStep",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const searchQuery = await vscode.window.showInputBox({
        placeHolder: "Step number",
        prompt: "Enter the step number you want to go to",
      });
      if (!searchQuery) {
        return;
      }
      const stepNumberStr = String(searchQuery);
      const stepRegex = new RegExp(`\\[STEP ${stepNumberStr}\\]`);
      const lines = editor.document.getText().split("\n");
      const lineNumber = lines.findIndex((line) => stepRegex.test(line));
      if (lineNumber === -1) {
        return vscode.window.showInformationMessage(
          '😔 Step "' + stepNumberStr + '" not found!'
        );
      }
      const range = editor.document.lineAt(lineNumber).range;
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.AtTop);
    }
  );

  const disposable5 = vscode.commands.registerCommand(
    "extension.refactorDocument",
    refactorDocument
  );

  async function refactorDocument() {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
      return;
    }

    const text = editor.document.getText();
    const lines = text.split("\n");
    const trimmedLines = lines.map((line) => line.trimEnd());
    const trimmedText = trimmedLines.join("\n");
    const replacedText = trimmedText.replace(/\t/g, "    ");

    editor.edit((editBuilder) => {
      const fullDocRange = new vscode.Range(
        editor.document.positionAt(0),
        editor.document.positionAt(text.length)
      );
      editBuilder.replace(fullDocRange, replacedText);
    });
  }

  context.subscriptions.push(disposable2);
  context.subscriptions.push(disposable3);
  context.subscriptions.push(disposable4);
  context.subscriptions.push(disposable5);
  context.subscriptions.push(disposable6);
}

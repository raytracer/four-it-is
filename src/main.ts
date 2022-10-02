import { hole, holeFlags, holeHeight, holeWidth } from "./hole";
import * as w4 from "./wasm4";

const victoryCondition = 4;
let coinOffsetY = 6;
let coinOffsetX = 0;
let drop = false;
let activeFirstPlayer = true;
let grid: Array<Array<u8>> = [
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0]
];
let steps = 0;
let victory: i32 = -1;
let start = true;

export function update(): void {

    if (start) {
        handleStart();
    } else if (victory !== -1) {
        handleVictory();
    } else {
        handleInput();
        handleLogic();
        drawActiveCoin();
        drawGrid();
        drawPlayerText();
    }
}

let previousGamepad: u8;

function handleInput(): void {
    const netplay = load<u8>(0x0020);
    const gamepad: u8 = netplay !== 0 && !activeFirstPlayer ? load<u8>(w4.GAMEPAD2) : load<u8>(w4.GAMEPAD1);

    // Only the buttons that were pressed down this frame
    const pressedThisFrame = gamepad & (gamepad ^ previousGamepad);
    previousGamepad = gamepad;

    if (!drop && pressedThisFrame & w4.BUTTON_RIGHT) {
        coinOffsetX = (coinOffsetX + 1) % 7;
    } else if (!drop && pressedThisFrame & w4.BUTTON_LEFT) {
        coinOffsetX = (coinOffsetX - 1 + 7) % 7;
    } else if (pressedThisFrame & w4.BUTTON_1) {
        if (getHighestRowInColumn(coinOffsetX) > 0) {
            drop = true;
        }
    }
}

function drawActiveCoin(): void {
    drawCoin(activeFirstPlayer, 24 + 4 + (coinOffsetX * 16), coinOffsetY);

    if (drop) {
        coinOffsetY = (coinOffsetY + 2) % 110;
    }
}

function drawCoin(isFirstPlayer: boolean, x: i32, y: i32): void {
    store<u16>(w4.DRAW_COLORS, 0x20);
    w4.blitSub(hole, x, y, 8, 8, 4, 4, holeWidth, holeFlags);

    store<u16>(w4.DRAW_COLORS, 3);
    if (isFirstPlayer) {
        w4.rect(x + 3, y + 3, 2, 2);
    } else {
        w4.rect(x + 2, y + 2, 4, 4);
        store<u16>(w4.DRAW_COLORS, 2);
        w4.rect(x + 3, y + 3, 2, 2);
    }
}

function drawGrid(): void {
    for (let i = 0; i < grid[0].length; i++) {
        for (let j = 0; j < grid.length; j++) {
            if (grid[j][i] === 1) {
                drawCoin(true, 24 + 4 + (i * 16), 24 + j * 16);
            } else if (grid[j][i] === 2) {
                drawCoin(false, 24 + 4 + (i * 16), 24 + j * 16);
            }
            store<u16>(w4.DRAW_COLORS, 0x03);
            w4.blit(hole, 24 + i * holeWidth, 20 + j * holeHeight, holeWidth, holeHeight, holeFlags);
        }
    }
}

function drawPlayerText(): void {
    store<u16>(w4.DRAW_COLORS, 3);
    w4.text("Player 1", 45, 130);
    w4.text("Player 2", 45, 140);
    drawCoin(true, 115, 130);
    drawCoin(false, 115, 140);

    store<u16>(w4.DRAW_COLORS, 2);

    if (activeFirstPlayer) {
        w4.text(">", 35, 130);
    } else {
        w4.text(">", 35, 140);
    }
}

function handleLogic(): void {
    if (drop) {
        const intYOffset = getHighestRowInColumn(coinOffsetX);
        const targetOffsetY = intYOffset * 16 + 10;

        if (coinOffsetY >= targetOffsetY) {
            steps++;
            coinOffsetY = 6;
            drop = false;
            grid[intYOffset - 1][coinOffsetX] = activeFirstPlayer ? 1 : 2;
            activeFirstPlayer = !activeFirstPlayer;

            w4.tone(650, 10 | (10 << 8), 25, w4.TONE_TRIANGLE);

            const victoryPlayer = testVictory();
            if (victoryPlayer !== 0) {
                w4.trace(`Player ${victoryPlayer} was victorious`);
                victory = victoryPlayer;
            } else {
                let draw = true;

                for (let i = 0; i < grid[0].length; i++) {
                    if (getHighestRowInColumn(i) > 0) {
                        draw = false;
                    }
                }

                if (draw) {
                    victory = 0;
                }
            }
        }
    }

}

function getHighestRowInColumn(column: i32): i32 {
    for (let i = 0; i < grid.length; i++) {
        if (grid[i][column] !== 0) {
            return i;
        }
    }

    return grid.length;
}

function testVictory(): u8 {
    //test rows
    for (let i = 0; i < grid.length; i++) {
        const testRow = testSeries(grid[i]);
        if (testRow !== 0) {
            return testRow;
        }
    }

    //test columns
    for (let i = 0; i < grid[0].length; i++) {
        const currentColumn: Array<u8> = [];

        for (let j = 0; j < grid.length; j++) {
            currentColumn.push(grid[j][i]);
        }

        const testColumn = testSeries(currentColumn);
        if (testColumn !== 0) {
            return testColumn;
        }
    }

    //test diagonals
    const rows = grid.length;
    const columns = grid[0].length;

    for (let i = 0; i < rows; i++) {
        if (i == 0) {
            for (let j = 0; j < columns; j++) {
                const diagonalResultPos = testDiagonal(j, 0, 1);
                if (diagonalResultPos !== 0) {
                    return diagonalResultPos;
                }
                const diagonalResultNeg = testDiagonal(j, 0, -1);
                if (diagonalResultNeg !== 0) {
                    return diagonalResultNeg;
                }
            }
        } else {
            const diagonalResultPosFirst = testDiagonal(0, i, 1);
            if (diagonalResultPosFirst !== 0) {
                return diagonalResultPosFirst;
            }
            const diagonalResultNegLast = testDiagonal(columns - 1, i, -1);
            if (diagonalResultNegLast !== 0) {
                return diagonalResultNegLast;
            }
        }
    }

    return 0;
}

function testDiagonal(x: i32, y: i32, direction: i32): u8 {
    const rows = grid.length;
    const columns = grid[0].length;
    const currentDiagonal: Array<u8> = [];

    while (x < columns && x >= 0 && y < rows && y >= 0) {
        currentDiagonal.push(grid[y][x]);
        x += direction;
        y += 1;
    }

    return testSeries(currentDiagonal);
}

function testSeries(series: Array<u8>): u8 {
    let countPlayer1 = 0;
    let countPlayer2 = 0;
    let last = 0;

    for (let i = 0; i < series.length; i++) {
        if (series[i] === 1) {
            if (last !== 1) {
                countPlayer1 = 0;
            }
            countPlayer1++;
        } else if (series[i] === 2) {
            if (last !== 2) {
                countPlayer2 = 0;
            }
            countPlayer2++;
        }

        last = series[i];

        if (countPlayer1 >= victoryCondition) {
            return 1;
        } else if (countPlayer2 >= victoryCondition) {
            return 2;
        }
    }

    return 0;
}

function handleVictory(): void {
    store<u16>(w4.DRAW_COLORS, 1);
    w4.rect(0, 0, 160, 160);

    store<u16>(w4.DRAW_COLORS, 3);
    if (victory !== 0) {
        w4.text("Player " + victory.toString() + " has won!", 10, 60);
        w4.text("It took " + steps.toString() + " steps", 17, 80);
    } else {
        w4.text("It is a draw!", 30, 60);
    }
    store<u16>(w4.DRAW_COLORS, 2);
    w4.text("Press \x80 to restart", 8, 90);

    const gamepad = load<u8>(w4.GAMEPAD1);
    // Only the buttons that were pressed down this frame
    const pressedThisFrame = gamepad & (gamepad ^ previousGamepad);
    previousGamepad = gamepad;

    if (pressedThisFrame & w4.BUTTON_1) {
        activeFirstPlayer = true;
        steps = 0;
        victory = -1;
        coinOffsetX = 0;
        grid = [
            [0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0]
        ];
    }


}

function handleStart(): void {
    store<u16>(w4.DRAW_COLORS, 1);
    w4.rect(0, 0, 160, 160);

    store<u16>(w4.DRAW_COLORS, 3);
    w4.text("Four It Is!", 36, 71);
    w4.text("Press \x80 to restart", 10, 90);
    store<u16>(w4.DRAW_COLORS, 2);
    w4.text("Four It Is!", 35, 70);

    const gamepad = load<u8>(w4.GAMEPAD1);
    // Only the buttons that were pressed down this frame
    const pressedThisFrame = gamepad & (gamepad ^ previousGamepad);
    previousGamepad = gamepad;

    if (pressedThisFrame & w4.BUTTON_1) {
        start = false;
    }
}


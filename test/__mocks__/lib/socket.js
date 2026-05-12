// This file mocks ../lib/socket.js
import { jest } from "@jest/globals";

// Mock the onlineUsers Map
export const onlineUsers = new Map([
    ["d1", "socket123"],
    ["d2", "socket456"],
]);

// Mock the io object and its to().emit() chain
export const io = {
    to: jest.fn(() => ({
        emit: jest.fn(),
    })),
};